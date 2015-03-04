# -*- coding: utf8 -*-
from datetime import datetime
from sqlalchemy import TypeDecorator
from sqlalchemy.ext.associationproxy import association_proxy
from zwl import app, db


class TrainType(db.Model):
    __tablename__ = 'zuege_zuggattungen'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column('zuggattung', db.String(11))
    description = db.Column('bezeichnung', db.String(255))
    category = db.Column('verkehrsart', db.Enum('fv', 'nv', 'gv', 'lz', 'sz'))

class Train(db.Model):
    __tablename__ = 'fahrplan_sessionzuege' if app.config['USE_SESSION_TIMETABLE'] else 'fahrplan_zuege'

    id = db.Column(db.Integer, primary_key=True)
    nr = db.Column('zugnummer', db.Integer)
    type_id = db.Column('zuggattung_id', db.Integer, db.ForeignKey(TrainType.id))
    vmax = db.Column(db.Integer)
    comment = db.Column('bemerkungen', db.String(255))
    transition_from_id = db.Column('uebergang_von_zug_id', db.Integer, db.ForeignKey(id))
    transition_to_id = db.Column('uebergang_nach_zug_id', db.Integer, db.ForeignKey(id))

    transition_from = db.relationship(lambda: Train, foreign_keys=transition_from_id, primaryjoin=transition_from_id==id, remote_side=id)
    transition_to = db.relationship(lambda: Train, foreign_keys=transition_to_id, primaryjoin=transition_to_id==id, remote_side=id)
    transition_from_nr = association_proxy('transition_from', 'nr')
    transition_to_nr = association_proxy('transition_to', 'nr')
    type_obj = db.relationship(TrainType)
    type = association_proxy('type_obj', 'name')
    category = association_proxy('type_obj', 'category')

    def __repr__(self):
        return '<%s #%s (%s %d)>' \
            % (self.__class__.__name__, self.id, self.type, self.nr)


class TimetableEntry(db.Model):
    __tablename__ = 'fahrplan_sessionfahrplan' if app.config['USE_SESSION_TIMETABLE'] else 'fzm'

    id = db.Column(db.Integer, primary_key=True)
    train_id = db.Column('zug_id', db.Integer, db.ForeignKey(Train.id))
    loc = db.Column('betriebsstelle', db.String(10))
    arr_plan = db.Column('ankunft_plan', db.Time)
    dep_plan = db.Column('abfahrt_plan', db.Time)
    track_plan = db.Column('gleis_plan', db.Integer)
    sorttime = db.Column('sortierzeit', db.Time)

    if app.config['USE_SESSION_TIMETABLE']:
        arr_want = db.Column('ankunft_soll', db.Time)
        arr_real = db.Column('ankunft_ist', db.Time)
        arr_pred = db.Column('ankunft_prognose', db.Time)
        dep_want = db.Column('abfahrt_soll', db.Time)
        dep_real = db.Column('abfahrt_ist', db.Time)
        dep_pred = db.Column('abfahrt_prognose', db.Time)
        track_want = db.Column('gleis_soll', db.Integer)
        track_real = db.Column('gleis_ist', db.Integer)
    else:
        arr_want = arr_real = arr_pred = property(arr_plan)
        dep_want = dep_real = dep_pred = property(dep_plan)
        track_want = track_real = property(track_plan)

    train = db.relationship(Train,
        backref=db.backref('timetable_entries', lazy='dynamic'))

    def __repr__(self):
        return '<%s train#%s at %s>' \
            % (self.__class__.__name__, self.train_id, self.loc)
