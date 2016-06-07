# -*- coding: utf8 -*-
"""
    zwl.trains
    ==========

    Processing of timetable data into a format suitable for the frontend.

    :copyright: (c) 2015, Marian Sigler
    :license: GNU GPL 2.0 or later.
"""

import itertools
import operator
from collections import defaultdict, deque, OrderedDict
from datetime import date, datetime, time
from zwl import app, db
from zwl.database import *
from zwl.lines import get_lineconfig
from zwl.utils import time2js

def get_train_ids_within_timeframe(starttime, endtime, line,
                                   startpos=0, endpos=1):
    """
    Get IDs of about all trains that run on the given
    line within the given timeframe.
    """
    #TODO allow to filter for stations between xstart and xend

    line = get_lineconfig(line)
    locations = {l.code for l in
        line.locations_extended_between(startpos, endpos)}

    #TODO filter for stations on `line`
    q = db.session.query(TimetableEntry.train_id).distinct() \
        .filter(TimetableEntry.sorttime.between(starttime, endtime)) \
        .filter(TimetableEntry.loc.in_(locations))
    train_ids = [row[0] for row in db.session.execute(q).fetchall()]

    return train_ids


def get_train_information(trains, line):
    """
    Get information and timetable about all given trains.
    If line is given, limit timetable information to locations on that line.
    Note that trains that only "touch" one location on the line are not
    included (for example, trains that start on the last stop of the line)

    @param trains: List of train ids or `Train` objects.
    @param line: `Line` object or line id.
    """
    line = get_lineconfig(line)

    if not trains:
        return

    # fetch all trains and create a lookup dict of the form {id: Train}
    #TODO: try to joinedload transition_{from,to}
    trains = dict(db.session.query(Train.id, Train).filter(Train.id.in_(
        (t if isinstance(t, (int, long)) else t.id) for t in trains)))

    # fetch all timetable entries we need in one query, sort them apart locally
    timetable_entries = TimetableEntry.query \
        .filter(TimetableEntry.train_id.in_(trains.keys())) \
        .order_by(TimetableEntry.sorttime).all()
    timetables = defaultdict(list)
    for row in timetable_entries:
        timetables[row.train_id].append(row)

    for tid, train in trains.items():
        segments = make_timetable(train, timetables[tid], line)

        if not segments:
            continue

        yield {
            'id': train.id,
            'type': train.type,
            'category': train.category,
            'nr': train.nr,
            'segments': segments,
            'transition_to': train.transition_to_nr,
            'transition_from': train.transition_from_nr,
            'comment': u'',
            'start': timetables[tid][0].loc,
            'end': timetables[tid][-1].loc,
        }


def make_timetable(train, timetable_entries, line):
    """
    Parse the train's `timetable_entries` and generate timetable statements
    for the given line.
    There may be several statements, because it is possible that a train
    appears multiple times on a line (e.g. if the line is a ring).

    Calculation assumes that one train passes every location only once. This
    is safe because this is required by German railway regulations, and thus
    enforced within EBuEf, too.

    Calculation is somewhat tolerant to small variations between the
    locations on `line` and the entries in the timetable (i.e. a new segment
    is not started only because one signal is missing in the timetable.)

    Segments containing only one location (e.g. a train that starts on the
    last stop of a line, a train that just crosses a line) are not output
    (because they cannot be drawn by the frontend anyway).

    :return: a list of segments, each of which being a dict with two elements:
             - `direction` (either `left` or `right`)
             - `timetable` (list of dicts, one per location)
    """
    # normally this is already sorted, but we better check that
    timetable_entries.sort(key=operator.attrgetter('sorttime'))
    timetable_locations = [e.loc for e in timetable_entries]

    def _add(seg, loc, tte, **kwargs):
        if loc.display_label:
            kwargs['track_plan'] = tte.track_plan
        seg['timetable'].append(dict(
            loc=loc.id,
            arr_plan=time2js(tte.arr_plan), #TODO use _real when available
            dep_plan=time2js(tte.dep_plan),
            **kwargs
        ))

    # segment: part of the train's route that is inside `line`.
    segments = []

    locations = deque(line.locations)
    # one run of this loop generates one segment
    while locations:
        cur_seg = {'timetable': []}

        starti = None

        # find the first stop within `line`
        while locations:
            loc = locations.popleft()
            if loc.code in timetable_locations:
                starti = timetable_locations.index(loc.code)
                _add(cur_seg, loc, timetable_entries[starti])
                break

        if starti is None:
            # none of the locations matched, abort
            break

        try:
            i, loc = find_next_common_location(locations, timetable_locations, starti)
        except NoMatchFound:
            # there is no second location, discard this segment
            print "train %d: No second stop found" % train.nr
            break
        _add(cur_seg, loc, timetable_entries[i])
        direction = -1 if i < starti else +1
        cur_seg['direction'] = 'left' if i < starti else 'right'

        while locations:
            try:
                i, loc = find_next_common_location(locations, timetable_locations, i, direction)
            except NoMatchFound:
                break

            _add(cur_seg, loc, timetable_entries[i])

        if direction == -1:
            cur_seg['timetable'].reverse()
        #TODO as soon as we have seconds, sort using them
        segments.append(cur_seg)

    return segments


def find_next_common_location(locations, timetable_locations, starti,
                              direction=None, loc_threshold=3, tt_threshold=3):
    """
    Find the next common location appearing in both `locations` and
    `timetable_locations` within the next `loc_threshold` locations and within
    the next `tt_threshold` `timetable_locations`. Search starts at the
    left end of `locations` and at index `starti` in `timetable_locations`.
    If `direction` is set, it must be `+1` or `-1`, and the search is limited
    to indexes higher resp. lower than `starti`.

    If a match is found, `locations` has all locations up to and including
    the matching one removed.
    If not, `locations` is reset to the state it had before.

    :return: A tuple of the form `(i, loc)` with
             `i` being the index of the match in `timetable_locations` and
             `loc` being the matching object from `locations`.
    :raise NoMatchFound: if no match is found.
    """
    # We need these threshold to cope with small inconsistencies between the
    # line's and timetable's locations (most common reason: a signal that is
    # only valid for the opposite direction and thus missing in the timetable)

    def _within_threshold(i):
        if direction is None:
            return abs(starti - i) < tt_threshold
        if direction == +1:
            return starti < i <= (starti + tt_threshold)
        if direction == -1:
            return starti > i >= (starti - tt_threshold)
        raise RuntimeError('direction, if set, must be +1 or -1')

    # if we don't find anything we have to put the locations back on
    # `locations` to restore everything as it was
    pushback = deque()

    for _ in range(loc_threshold):
        if not locations:
            break

        loc = locations.popleft()
        pushback.appendleft(loc)

        try:
            i = timetable_locations.index(loc.code)
        except ValueError:
            continue

        if _within_threshold(i):
            return i, loc

    # restore state of before to allow further inspection
    locations.extendleft(pushback)
    raise NoMatchFound()

class NoMatchFound(ValueError):
    pass
