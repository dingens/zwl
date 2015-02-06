# -*- coding: utf8 -*-
from collections import defaultdict
from datetime import date, datetime, time
from zwl import app, db
from zwl.database import *
from zwl.lines import get_line
from zwl.utils import time2js

def get_train_ids_within_timeframe(starttime, endtime, line):
    """
    Get IDs of about all trains that run on the given
    line within the given timeframe.
    """
    line = get_line(line)

    #TODO allow to filter for stations between xstart and xend
    q = db.session.query(TimetableEntry.train_id).distinct() \
        .filter(TimetableEntry.sorttime.between(starttime, endtime))
    train_ids = [row[0] for row in db.session.execute(q).fetchall()]

    return train_ids


def get_train_information(trains, line=None):
    """
    Get information and timetable about all given trains.
    If line is given, limit timetable information to locations on that line.
    Note that trains that only "touch" one location on the line are not
    included (for example, trains that start on the last stop of the line)

    @param trains: List of train ids or `Train` objects.
    @param line: `Line` object or line id.
    """
    line = get_line(line)

    # this emits many queries if many of the trains are not in the
    # session cache but saves a lot if most are already there...
    for i, tr in enumerate(trains):
        if isinstance(tr, (int, long)):
            trains[i] = Train.query.get(tr)

    trains = {t.id : t for t in trains}

    # fetch all timetable entries we need in one query, sort them apart locally
    timetable_entries = TimetableEntry.query \
        .filter(TimetableEntry.train_id.in_(trains.keys())) \
        .order_by(TimetableEntry.sorttime).all()
    timetables = defaultdict(list)
    for row in timetable_entries:
        timetables[row.train_id].append(row)

    for tid, train in trains.items():
        #TODO: emit multiple seperate timetable lists if some train leaves the
        #      line and re-enters from the opposite direction
        timetable = []
        for ttentry in timetables[tid]:
            if line and ttentry.loc not in line.locationcodes:
                continue
            timetable.append({
                'loc': '%s#1' % ttentry.loc, #TODO
                'arr_real': time2js(ttentry.arr),
                'dep_real': time2js(ttentry.dep),
                })

        if len(timetable) < 2:
            continue

        yield {
            'type': train.type,
            'nr': train.nr,
            'timetable': timetable,
            'timetable_hash': 0, #TODO
            'direction': timetables[tid][0].direction, #TODO
            'transition_to': train.transition_to_nr,
            'transition_from': train.transition_from_nr,
            'comment': u'',
        }
