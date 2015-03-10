# -*- coding: utf8 -*-
from collections import defaultdict, namedtuple
from datetime import timedelta
from math import ceil
from zwl import app, db
from zwl.database import Train, TimetableEntry, MinimumStopTime
from zwl.utils import timediff, timeadd, writable_namedtuple

class Journey(object):
    def __init__(self, train, now, timetable=None):
        self.train = train
        self.now = now
        if timetable is None:
            timetable = train.timetable_entries.order_by(TimetableEntry.sorttime.asc()).all()
        if not timetable:
            raise ValueError('Empty timetable for %r' % train)
        self.timetable = timetable

        # ensure we don't use old predictions, predictions are based on _want
        # and _real data only. As we don't commit the transaction in between,
        # the `None`s won't make it into the database.
        for e in self.timetable:
            e.arr_pred = e.dep_pred = None

        self.position = self._find_current_position()

    def run(self):
        action = None
        while True:
            try:
                current = self.timetable[self.position]
            except IndexError:
                # journey has ended.
                #TODO: handle transition to next train
                break

            ### section one: handle arrival
            last_action = action
            if self.position > 0:
                if current.arr_real is not None:
                    # has already happened, but still we need to report it
                    # for track occupation
                    action = Arrive(self, current.arr_real,
                                Location(current.loc, current.track_real))
                else:
                    last = self.timetable[self.position-1]
                    current.arr_pred = self._earliest_arrival(last, current)

                    action = Arrive(self, current.arr_pred,
                                    Location(current.loc, current.track_want))

                if last_action is not None:
                    last_action.set_expected_release_time(action.time)
                result = (yield action)
                if not isinstance(result, Admitted):
                    raise ValueError('expected admission, got %r' % result)

                if current.dep_want is None:
                    # train ends here, we're done
                    break

            ### section two: handle ride to next location
            last_action = action
            try:
                next = self.timetable[self.position+1]
            except IndexError:
                if self.position == 0:
                    raise ValueError('Timetable of %r has less than two stops'
                                     % self.train)
                break

            try:
                succ = self.timetable[self.position+2]
                succ = Location(succ.loc, succ.track_want)
            except IndexError:
                succ = None

            if current.dep_real:
                # has already happened, but still we need to mark current
                # track as occupied
                if last_action is not None:
                    last_action.set_expected_release_time(current.dep_real)
                action = Ride(self, current.dep_real,
                              Location(current.loc, current.track_want),
                              Location(next.loc, next.track_want),
                              succ)
                result = (yield action)
                if not isinstance(result, Admitted):
                    raise RuntimeError('Not admitted for a ride that has '
                            'already started, got: %r' % result)
            else:
                current.dep_pred = self._earliest_departure(current)

                while True:
                    if last_action is not None:
                        last_action.set_expected_release_time(current.dep_pred)

                    #TODO do we need to consider current.track_real?
                    action = Ride(self, current.dep_pred,
                                  Location(current.loc, current.track_want),
                                  Location(next.loc, next.track_want),
                                  succ)

                    result = (yield action)
                    if isinstance(result, NotFree):
                        current.dep_pred = result.expected_release_time
                    elif isinstance(result, Admitted):
                        break
                    else:
                        raise RuntimeError('expected subclass of Response, '
                                           'got %s' % result)

            self.position += 1

    def _find_current_position(self):
        """Find the latest timetable entry where the train has already been."""
        for i, e in reversed(list(enumerate(self.timetable))):
            if e.arr_real is not None or e.dep_real is not None:
                return i
        return 0

    def _earliest_arrival(self, last, current):
        """
        Calculate the earliest point in time when the train can arrive
        at `current`.
        This is the departure time at the last station plus the minimum ride
        time, but not earlier than `self.now`.
        """
        last_dep = last.dep_real if last.dep_real is not None else last.dep_pred

        # use real (not min) ride time if we are not delayed
        if last_dep <= last.dep_want:
            min_ridetime = timediff(current.arr_want, last.dep_want)
            #TODO special case: very small delay

        else:
            if last.min_ridetime is not None:
                min_ridetime = last.min_ridetime
            else:
                ridetime = timediff(current.arr_want, last.dep_want).total_seconds()
                ratio = app.config['MINIMUM_TRAVEL_TIME_RATIO']
                min_ridetime = timedelta(seconds=ceil(ridetime*ratio))

        return max(self.now, timeadd(last_dep, min_ridetime))

    def _earliest_departure(self, cur):
        """
        Calculate the earliest point in time when the train can depart
        from the current location (`cur`).
        This is the arrival time plus the minimum stopping time, but not
        earlier than the planned departure time or `self.now`.
        """
        if cur.arr_want is None:
            # this is the train's first stop
            assert cur.arr_real is None
            return max(self.now, cur.dep_want)

        #TODO: if too early, only wait in stations
        arr = cur.arr_real if cur.arr_real is not None else cur.arr_pred
        if cur.min_stoptime is not None:
            min_stoptime = cur.min_stoptime
        else:
            min_stoptime = MinimumStopTime.lookup(self.train, cur.loc,
                    cur.track_real or cur.track_want)
        min_stoptime = timedelta(seconds=min_stoptime)

        planned_stoptime = timediff(cur.dep_want, cur.arr_want)
        min_stoptime = min(min_stoptime, planned_stoptime)

        return max(self.now, cur.dep_want, timeadd(arr, min_stoptime))

    def __repr__(self):
        return '<Journey of %r>' % self.train


class Manager(object):
    def __init__(self, journeys, now):
        self.journeys = journeys
        self.now = now
        self.elements = defaultdict(lambda: None)

    def run(self):
        queue = []
        for j in self.journeys:
            runner = j.run()

            next_action = runner.next()

            queue.append(QueueEntry(j, runner, next_action))

        while queue:
            # find the journey with the earliest action
            queue.sort(key=lambda qe: qe.next_action.time)
            entry = queue[0]
            journey, runner, action = entry

            response = action.allocate(self)

            try:
                entry.next_action = runner.send(response)
            except StopIteration:
                #TODO free occupations
                queue.pop(0)


    @classmethod
    def from_timestamp(cls, now):
        """
        Initialize using a given start time.

        All trains running config.PREDICTION_INTERVAL seconds from that start
        time are used.
        """
        d = timedelta(seconds=app.config['PREDICTION_INTERVAL'])
        endtime = (datetime.combine(date(1,1,1), now) + d).time()
        endtime = max(endtime, time(23,59,59)) #TODO after-midnight support

        q = db.session.query(TimetableEntry.train_id) \
            .filter(TimetableEntry.sorttime.between(starttime.time(), endtime))

        trains = Train.query.filter(Train.id.in_(q)).all()

        return cls.from_trains(trains, now)

    @classmethod
    def from_trains(cls, trains, now):
        return cls([Journey(t, now) for t in trains], now)

    def __repr__(self):
        return '<Manager time=%s (%d journeys)>' % \
            (self.time.strftime('%T'), len(self.journeys))


class Action(object):
    """
    Represents an action a train (represented by a Journey object) wants to
    carry out. Different action types are implemented using subclasses.

    `Action` objects yielded by the Journey and acted upon by the Manager.

    :param time: Time when the action is carried out (`datetime.time` object)
                 For conditional actions, this is the time when the Journey
                 wishes to carry out the action.
    """
    def __init__(self, journey, time):
        self.journey = journey
        assert time is not None
        self.time = time

        self.manager = None
        self.required_elements = self.find_required_elements()

    def set_expected_release_time(self, rtime):
        for e in self.required_elements:
            self.manager.elements[e].expected_release_time = rtime

    def allocate(self, manager):
        assert self.manager is None, 'must be called only once'

        self.manager = manager
        expected_release_times = []

        # check if we could execute the action
        for elem_name in self.required_elements:
            elem = manager.elements[elem_name]
            if elem is None or elem.journey is self.journey:
                continue
            expected_release_times.append(elem.expected_release_time)

        # we cannot, there are occupied elements
        if expected_release_times:
            expected_release_time = timeadd(max(expected_release_times),
                    timedelta(seconds=1))
            assert expected_release_time > self.time
            return NotFree(expected_release_time)

        # mark required elements
        for elem_name in self.required_elements:
            manager.elements[elem_name] = Occupancy(self.journey, None)

        for elem_name in manager.elements:
            if manager.elements[elem_name] is None:
                continue
            if manager.elements[elem_name].journey is self.journey:
                if elem_name not in self.required_elements:
                    manager.elements[elem_name] = None

        return Admitted()


class Arrive(Action):
    """
    Arrive at a location.

    When used, the location is marked as occupied by the train. If the train
    had carried out a `Ride` action before, those track elements are freed.
    """
    def __init__(self, journey, time, loc):
        self.loc = loc
        super(Arrive, self).__init__(journey, time)

    def find_required_elements(self):
        return [(self.loc.code, self.loc.track)]

    def __repr__(self):
        return '<Arrive %r %s at %s[%s]>' % (self.journey,
                self.time.strftime('%T'), self.loc.code, self.loc.track)


class Ride(Action):
    """
    Normal (non-shunting) ride from one location to another (`start` to `end`).

    When used, all track elements between the two locations (and the two
    locations themselves) are marked as in use by the train.

    :param start: start location and track
    :param end: end location and track
    :param succ: location after end, if available. Needed for correct routing.
    """
    def __init__(self, journey, time, start, end, succ=None):
        self.start = start
        self.end = end
        self.succ = succ
        super(Ride, self).__init__(journey, time)

    def find_required_elements(self):
        return [
            (self.start.code, self.start.track),
            ('line', self.start.code, self.end.code),
            (self.end.code, self.end.track),
        ]

    def __repr__(self):
        return '<Ride %r %s from %s[%s] to %s[%s]>' % (self.journey,
                self.time.strftime('%T'), self.start.code, self.start.track,
                self.end.code, self.end.track)

class Response(object):
    """
    Baseclass for responses the Manager sends to the trains (represented by
    a Journey object) after they sent an `Action` they wish to execute.
    """
    pass

class Admitted(Response):
    """
    Response meaning: The desired action is admitted as requested.
    """
    pass

class NotFree(Response):
    """
    Response meaning: The desired action is not possible at the desired time
    due to lack of free tracks. They are expected to be free at
    `expected_release_time`.
    """
    def __init__(self, expected_release_time):
        self.expected_release_time = expected_release_time
        super(NotFree, self).__init__()

Location = namedtuple('Location', ['code', 'track'])
Occupancy = writable_namedtuple('Occupancy', ['journey', 'expected_release_time'])

QueueEntry = writable_namedtuple('QueueEntry', ('journey', 'runner', 'next_action'))
