#!/usr/bin/env python2
# -*- coding: utf8 -*-
from zwl import app, db, trains
from zwl.database import *
from zwl.lines import get_line
from datetime import time
import itertools
import os
import tempfile
import unittest

class TestTrains(unittest.TestCase):
    def setUp(self):
        self.db_fd, self.db = tempfile.mkstemp()
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///%s' % self.db
        app.config['TESTING'] = True
        self.app = app.test_client()
        db.metadata.create_all(bind=db.engine)

        ice = TrainType(name='ICE')
        re = TrainType(name='RE')
        self.t1 = Train(nr=700, type_obj=ice)
        self.t2 = Train(nr=2342, type_obj=re)
        db.session.add_all([ice, re, self.t1, self.t2])
        db.session.commit()

        t1 = self.t1.id
        db.session.add_all([
            self.t1,
            TimetableEntry(train_id=t1, loc='XWF', arr_plan=None,        dep_plan=time(15,30), sorttime=time(15,30), direction_code=11),
            TimetableEntry(train_id=t1, loc='XLG', arr_plan=time(15,34), dep_plan=time(15,34), sorttime=time(15,34)),
            TimetableEntry(train_id=t1, loc='XBG', arr_plan=time(15,35), dep_plan=time(15,36), sorttime=time(15,36)),
            TimetableEntry(train_id=t1, loc='XDE', arr_plan=time(15,39), dep_plan=time(15,40), sorttime=time(15,40)),
            TimetableEntry(train_id=t1, loc='XCE', arr_plan=time(15,43), dep_plan=None,        sorttime=time(15,43)),
        ])

        t2 = self.t2.id
        db.session.add_all([
            self.t2,
            TimetableEntry(train_id=t2, loc='XPN', arr_plan=None,        dep_plan=time(16,21), sorttime=time(16,21), direction_code=11),
            TimetableEntry(train_id=t2, loc='XLG', arr_plan=time(16,23), dep_plan=time(16,23), sorttime=time(16,23)),
            TimetableEntry(train_id=t2, loc='XWF', arr_plan=time(16,27), dep_plan=time(16,30), sorttime=time(16,30)),
            TimetableEntry(train_id=t2, loc='XCE', arr_plan=time(16,32), dep_plan=time(16,33), sorttime=time(16,33)),
            TimetableEntry(train_id=t2, loc='XDE', arr_plan=time(16,36), dep_plan=None,        sorttime=time(16,36)),
        ])
        db.session.commit()

    def test_get_train_ids_within_timeframe(self):
        ids = trains.get_train_ids_within_timeframe(time(15,40), time(16,00), get_line('sample'))
        assert self.t1.id in ids
        assert self.t2.id not in ids

    def test_get_train_information(self):
        res = list(trains.get_train_information([self.t1], get_line('sample')))

        assert len(res) == 1
        inf = res[0]
        assert inf['nr'] == 700
        assert inf['type'] == 'ICE'
        assert len(inf['segments']) == 2

        assert sorted([['XDE#1', 'XCE#1'], ['XLG#1', 'XBG#2', 'XDE#2']]) == \
            sorted([[e['loc'] for e in seg['timetable']] for seg in inf['segments']])

        allelemsd = {e['loc']: e for e in
            itertools.chain.from_iterable(seg['timetable'] for seg in inf['segments'])}
        #TODO activate when implemented
        #assert allelemsd['XDE#2']['succ'] == 'XCE'
        #assert allelemsd['XLG#1']['pred'] == 'XWF'

    def tearDown(self):
        os.close(self.db_fd)
        #os.unlink(self.db)


if __name__ == '__main__':
    unittest.main()
