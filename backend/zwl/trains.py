# -*- coding: utf8 -*-
from collections import defaultdict
from datetime import datetime, time
from zwl import app, db
from zwl.database import *
from zwl.lines import get_line

def get_trains_within_timeframe(starttime, endtime, line, xstart=0, xend=1):
    """
    Get information and timetable about all trains that run on the given
    line within the given timeframe.
    Note that trains that only "touch" one location on the line are not
    included (for example, trains that start on the last stop of the line)
    """
    line = get_line(line)
    if not isinstance(starttime, time):
        starttime = datetime.fromtimestamp(float(starttime)).time()
    if not isinstance(endtime, time):
        endtime = datetime.fromtimestamp(float(endtime)).time()

    #TODO use only stations on `line` between xstart and xend
    q = db.session.query(Timetable.train_id).distinct() \
        .filter(Timetable.sorttime.between(starttime, endtime))
    train_ids = [row[0] for row in db.session.execute(q).fetchall()]

    return get_trains(train_ids, line)


def get_trains(train_ids, line=None):
    """
    Get information and timetable about all trains with the given ids.
    If line is given, limit timetable information to locations on that line.
    """
    line = get_line(line)
    timetable_entries = Timetable.query.filter(Timetable.train_id.in_(train_ids)) \
        .order_by(Timetable.sorttime).all()
    trains = Trains.query.filter(Trains.id.in_(train_ids)).all()

    trains = {t.id : t for t in trains}

    timetables = defaultdict(list)
    for row in timetable_entries:
        timetables[row.train_id].append(row)

    for tid in train_ids:
        train = Trains.query.get(tid)

        #TODO: emit multiple seperate timetable lists if train leaves the line
        #      and re-enters from the opposite direction
        timetable = []
        for ttentry in timetables[tid]:
            if line and ttentry.loc not in line.locationcodes:
                continue
            timetable.append({
                'loc': '%s#1' % ttentry.loc, #TODO
                'arr_real': _stringtime2time(ttentry.arr),
                'dep_real': _stringtime2time(ttentry.dep),
                })

        if len(timetable) < 2:
            continue

        yield {
            'type': u'#%s' % train.type_id, #TODO
            'nr': train.nr,
            'timetable': timetable,
            'timetable_hash': 0, #TODO
            'direction': timetables[tid][0].direction, #TODO
            'comment': u'',
        }

def _stringtime2time(s):
    if not s:
        return None

    if len(s) == 5:
        time = datetime.strptime(s, '%H:%M')
    elif len(s) == 7:
        time = datetime.strptime(s, '%H:%M:%S')
    else:
        raise ValueError('unsupported time spec: %r' % s)

    return int(datetime(1970, 6, 1, time.hour, time.minute, time.second).strftime('%s'))
