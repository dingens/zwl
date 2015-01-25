# -*- coding: utf8 -*-
from sqlalchemy.ext.declarative import declared_attr
from zwl import app, db

#TODO add relations

class TrainType(db.Model):
    __tablename__ = 'zuege_zuggattungen'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column('zuggattung', db.String(11))
    description = db.Column('bezeichnung', db.String(255))
    category = db.Column('verkehrsart', db.Enum('fv', 'nv', 'gv', 'lz', 'sz'))

class CommonTimetable(db.Model):
    __abstract__ = True
    id = db.Column(db.Integer, primary_key=True)
    train_id = db.Column('zug_id', db.Integer)
    loc = db.Column('betriebsstelle', db.String(10))
    arr = db.Column('ankunft', db.String(7))
    dep = db.Column('abfahrt', db.String(7))
    track = db.Column('gleis', db.String(5))
    direction_ = db.Column('fahrtrichtung', db.Integer)
    sorttime = db.Column('sortierzeit', db.Time)

    def __repr__(self):
        return '<%s zug_id=%d at %r>' \
            % (self.__class__.__name__, self.train_id, self.loc)

    @property #TODO: use sqlalchemy hybrid or something
    def direction(self):
        return {0: 'left', 1: 'right', 10: 'left', 11: 'right'}[self.direction_]


class StaticTimetable(CommonTimetable):
    __tablename__ = 'fzm'

class SessionTimetable(CommonTimetable):
    __tablename__ = 'fahrplan_sessionfahrplan'
    arr_want = db.Column('ankunft_soll', db.String(7))
    arr_real = db.Column('ankunft_ist', db.String(7))
    dep_want = db.Column('abfahrt_soll', db.String(7))
    dep_real = db.Column('abfahrt_ist', db.String(7))
    track_want = db.Column('gleis_soll', db.String(5))
    track_real = db.Column('gleis_ist', db.String(5))

Timetable = SessionTimetable if app.config['USE_SESSION_TIMETABLE'] else StaticTimetable

class CommonTrain(db.Model):
    __abstract__ = True
    id = db.Column(db.Integer, primary_key=True)
    nr = db.Column('zugnummer', db.Integer)
    @declared_attr
    def type_id(self):
        return db.Column('zuggattung_id', db.Integer, db.ForeignKey(TrainType.id))
    vmax = db.Column(db.Integer)
    comment = db.Column('bemerkungen', db.String(255))

#    @declared_attr
#    def type_obj(self):
#        return db.relationship(TrainType, primaryjoin=self.type_id==TrainType.id)

class StaticTrain(CommonTrain):
    __tablename__ = 'fahrplan_zuege'

class SessionTrain(CommonTrain):
    __tablename__ = 'fahrplan_sessionzuege'

Train = SessionTrain if app.config['USE_SESSION_TIMETABLE'] else StaticTrain