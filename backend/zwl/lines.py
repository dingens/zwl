# -*- coding: utf8 -*-
from werkzeug.utils import cached_property

def get_line(line):
    if line is None:
        return line

    if isinstance(line, Line):
        return line

    return lines[line]

class Line(object):
    def __init__(self, id, name, elements):
        self.id = id
        self.name = name

        self.elements = list(self.__class__.add_openlines(elements))

    @staticmethod
    def add_openlines(locations):
        for i in range(len(locations)-1):
            last = locations[i]
            next = locations[i+1]
            yield last

            if isinstance(last, OpenLine) or isinstance(next, OpenLine):
                continue

            if last.pos != next.pos:
                yield OpenLine('%s_%s' % (last.id, next.id),
                               (last.pos + next.pos)/2)
        yield locations[-1]

    @cached_property
    def locationcodes(self):
        return list(e.code for e in self.elements if hasattr(e, 'code'))

    def serialize(self):
        return dict(
            id=self.id,
            name=self.name,
            elements=[e.serialize() for e in self.elements],
        )

    def __repr__(self):
        return '<Line %s #elem=%d>' % (self.id, len(self.elements))


class Loc(object):
    def __init__(self, id, pos):
        self.id = id
        self.pos = pos

    def serialize(self):
        return dict(
            type=self.typecode,
            id=self.id,
            pos=self.pos,
        )

    def __repr__(self):
        return '<Loc type=%s id=%s>' % (self.typecode, self.id)

class Station(Loc):
    typecode = 'bhf'
    def __init__(self, id, pos, code, name):
        super(Station, self).__init__(id, pos)
        self.code = code
        self.name = name #TODO: fetch from db

    def serialize(self):
        return dict(
            code=self.code,
            name=self.name,
            **super(Station, self).serialize()
        )

class Stop(Station):
    typecode = 'hp'

class BlockPost(Loc):
    typecode = 'bk'
    def __init__(self, id, pos, code, name):
        super(BlockPost, self).__init__(id, pos)
        self.code = code
        self.name = name #TODO: fetch from db

    def serialize(self):
        return dict(
            code=self.code,
            name=self.name,
            **super(BlockPost, self).serialize()
        )

class OpenLine(Loc):
    typecode = 'str'
    def __init__(self, id, pos, length=None, tracks=None):
        super(OpenLine, self).__init__(id, pos)
        self.length = length
        self.tracks = tracks

    def serialize(self):
        return dict(
            length=self.length,
            tracks=self.tracks,
            **super(OpenLine, self).serialize()
        )

class Signal(Loc):
    typecode = 'sig'
    def __init__(self, id, pos, code, direction):
        super(Signal, self).__init__(id, pos)
        self.code = code
        self.direction = direction

    def serialize(self):
        return dict(
            direction=self.direction,
            **super(Signal, self).serialize()
        )

lines = {}
def add_line(*args, **kwargs):
    l = Line(*args, **kwargs)
    assert l.id not in lines
    lines[l.id] = l

add_line('sample', u'Beispielsträcke', [
    Station('XDE#1', 0, 'XDE', u'Derau'),
    OpenLine('XDE#1_XCE#1', .15, 3000, 2),
    Station('XCE#1', .3, 'XCE', u'Cella'),
    OpenLine('XCE#1_XLG#1', .4, 2000, 2),
    Station('XLG#1', .5, 'XLG', u'Leopoldgrün'),
    OpenLine('XLG#1_XDE#2', .75, 5000, 2),
    Station('XDE#2', 1, 'XDE', u'Derau'),
])

add_line('ring-xde', u'Ring, XCE-XDE-XBG', [
    # xwf#1
    Station('XCE#1', 0, 'XCE', u'Cella'),
    BlockPost('XAP#1', .3, 'XAP', u'Alp'),
    Station('XDE#1', .5, 'XDE', u'Derau'),
    Signal('XSBK4#1', .65, 'XSBK4', 'right'),
    Signal('XSBK3#1', .65, 'XSBK4', 'left'),
    Signal('XSBK2#1', .75, 'XSBK4', 'right'),
    Signal('XSBK1#1', .75, 'XSBK4', 'left'),
    # anst berg
    Station('XBG#1', .9, 'XBG', u'Berg'),
    Station('XLG#1', 1, 'XLG', u'Leopoldgrün'),
    # xwf#2
])
