# -*- coding: utf8 -*-
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.ext.associationproxy import association_proxy
from zwl import app, db

#TODO add relations

class TimetableEntry(db.Model):
    __tablename__ = 'fahrplan_sessionfahrplan' if app.config['USE_SESSION_TIMETABLE'] else 'fzm'

    id = db.Column(db.Integer, primary_key=True)
    train_id = db.Column('zug_id', db.Integer)
    loc = db.Column('betriebsstelle', db.String(10))
    arr = db.Column('ankunft', db.String(7))
    dep = db.Column('abfahrt', db.String(7))
    track = db.Column('gleis', db.String(5))
    direction_code = db.Column('fahrtrichtung', db.Integer)
    sorttime = db.Column('sortierzeit', db.Time)

    if app.config['USE_SESSION_TIMETABLE']:
        arr_want = db.Column('ankunft_soll', db.String(7))
        arr_real = db.Column('ankunft_ist', db.String(7))
        dep_want = db.Column('abfahrt_soll', db.String(7))
        dep_real = db.Column('abfahrt_ist', db.String(7))
        track_want = db.Column('gleis_soll', db.String(5))
        track_real = db.Column('gleis_ist', db.String(5))
    else:
        arr_want = arr_real = property(arr)
        dep_want = dep_real = property(dep)
        track_want = track_real = property(track)

    def __repr__(self):
        return '<%s zug_id=%d at %r>' \
            % (self.__class__.__name__, self.train_id, self.loc)

    @property #TODO: use sqlalchemy hybrid or something
    def direction(self):
        return {0: 'left', 1: 'right', 10: 'left', 11: 'right'}[self.direction_code]

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

    type_obj = db.relationship(TrainType)
    type = association_proxy('type_obj', 'name')
