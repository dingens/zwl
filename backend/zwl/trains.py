# -*- coding: utf8 -*-
from collections import defaultdict
from datetime import date, datetime, time
from zwl import app, db
from zwl.database import *
from zwl.lines import get_line
from zwl.utils import time2js

def get_train_information_within_timeframe(starttime, endtime, line, xstart=0, xend=1):
    """
    Get information and timetable about all trains that run on the given
    line within the given timeframe.
    Note that trains that only "touch" one location on the line are not
    included (for example, trains that start on the last stop of the line)
    """
    line = get_line(line)

    #TODO use only stations on `line` between xstart and xend
    q = db.session.query(TimetableEntry.train_id).distinct() \
        .filter(TimetableEntry.sorttime.between(starttime, endtime))
    train_ids = [row[0] for row in db.session.execute(q).fetchall()]

    return get_train_information(train_ids, line)


def get_train_information(train_ids, line=None):
    """
    Get information and timetable about all trains with the given ids.
    If line is given, limit timetable information to locations on that line.
    """
    line = get_line(line)

    #TODO: use joinedload or something for transition_{from,to}
    trains = Train.query.filter(Train.id.in_(train_ids)).all()
    trains = {t.id : t for t in trains}

    # fetch all timetable entries we need in one query, sort them apart locally
    timetable_entries = TimetableEntry.query \
        .filter(TimetableEntry.train_id.in_(train_ids)) \
        .order_by(TimetableEntry.sorttime).all()
    timetables = defaultdict(list)
    for row in timetable_entries:
        timetables[row.train_id].append(row)

    for tid in train_ids:
        train = Train.query.get(tid)

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
