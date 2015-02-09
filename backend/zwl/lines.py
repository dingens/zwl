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

    @cached_property
    def locations(self):
        """All elements of the line that are not open line segments."""
        return [e for e in self.elements if isinstance(e, Loc)]

    def serialize(self):
        return dict(
            id=self.id,
            name=self.name,
            elements=[e.serialize() for e in self.elements],
        )

    def __repr__(self):
        return '<Line %s #elem=%d>' % (self.id, len(self.elements))


class Elem(object):
    """Baseclass for all line element types. Not to be used directly."""
    display_label = False

    def __init__(self, id, pos):
        self.id = id
        assert 0 <= pos <= 100
        self.pos = pos * 0.01

    def serialize(self):
        return dict(
            type=self.typecode,
            id=self.id,
            pos=self.pos,
            display_label=self.display_label,
        )

    def __repr__(self):
        return '<Loc type=%s id=%s>' % (self.typecode, self.id)

class OpenLine(Elem):
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

class Loc(Elem):
    """Baseclass for all line element types that are points (ie no open line)"""
    def __init__(self, id, pos, name=None):
        super(Loc, self).__init__(id, pos)
        self.code, _ = self.id.split('#') # ensure id contains exactly one `#`
        self.name = name #TODO: fetch from db

    def serialize(self):
        return dict(
            code=self.code,
            name=self.name,
            **super(Loc, self).serialize()
        )

class Station(Loc):
    typecode = 'bhf'
    display_label = True

class Stop(Station):
    typecode = 'hp'
    display_label = True

class BlockPost(Loc):
    typecode = 'bk'
    display_label = True

class Signal(Loc):
    typecode = 'sig'
    def __init__(self, id, pos, direction):
        super(Signal, self).__init__(id, pos)
        assert direction in ('left', 'right', 'both')
        self.direction = direction

    def serialize(self):
        return dict(
            direction=self.direction,
            **super(Signal, self).serialize()
        )

class Junction(Loc):
    typecode = 'abzw'

lines = {}
def add_line(*args, **kwargs):
    l = Line(*args, **kwargs)
    assert l.id not in lines
    lines[l.id] = l

add_line('sample', u'Beispielsträcke', [
    Station('XDE#1', 0, u'Derau'),
    OpenLine('XDE#1_XCE#1', 15, 3000, 2),
    Station('XCE#1', 30, u'Cella'),
    OpenLine('XCE#1_XLG#1', 40, 2000, 2),
    Station('XLG#1', 50, u'Leopoldgrün'),
    OpenLine('XLG#1_XBG#2', 65, 1000, 2),
    Station('XBG#2', 60, u'Berg'),
    OpenLine('XBG#2_XDE#2', 80, 4000, 2),
    Station('XDE#2', 100, u'Derau'),
])

add_line('ring-xde', u'Ring, XWF-XCE-XDE-XBG-XWF', [
    Signal('XWF_F#1', 0, 'right'),
    Signal('XWF_N#1', 0, 'left'),
    Station('XWF#1', 1, u'Walfdorf'),
    Signal('XWF_P#1', 2, 'right'),
    Signal('XWF_A#1', 2, 'left'),
    OpenLine('XWF#1_XCE#1', 8, 1000, 2),
    Signal('XCE_F#1', 15, 'right'),
    Signal('XCE_N#1', 15, 'left'),
    Station('XCE#1', 16, u'Cella'),
    Signal('XCE_P#1', 17, 'right'),
    Signal('XCE_A#1', 17, 'left'),
    OpenLine('XCE#1_XAP#1', 25, 1800, 2),
    Signal('XAP_B#1', 29, 'right'),
    BlockPost('XAP#1', 30, u'Alp'),
    Signal('XAP_A#1', 31, 'left'),
    OpenLine('XAP#1_XDE#2', 34, 1300, 2),
    Signal('XDE_F#2', 39, 'right'),
    Signal('XDE_N#2', 39, 'left'),
    Station('XDE#2', 40, u'Derau'),
    Signal('XDE_P#2', 41, 'right'),
    Signal('XDE_A#2', 41, 'left'),
    OpenLine('XDE#2_XSBK4#3', 44, 500, 2),
    Signal('XSBK4#3', 46, 'right'),
    OpenLine('XSBK4#3_XSBK4#3', 47, 500, 2),
    Signal('XSBK3#3', 49, 'left'),
    OpenLine('XSBK3#3_XSBK2#3', 50, 500, 2),
    Signal('XSBK2#3', 52, 'right'),
    OpenLine('XSBK2#3_XSBK1#3', 53, 500, 2),
    Signal('XSBK1#3', 55, 'left'),
    OpenLine('XSBK1#3_XBA#3', 61, 2000, 2),
    Junction('XBA_A#3', 68, u'Anst Stadt Berg'),
    OpenLine('XBA#3_XBG#3', 70, 500, 2),
    Signal('XBG_F#3', 72, 'right'),
    Signal('XBG_N#3', 72, 'left'),
    Station('XBG#3', 73, u'Berg'),
    Signal('XBG_P#3', 74, 'right'),
    Signal('XBG_A#3', 74, 'left'),
    OpenLine('XBG#3_XLG#3', 78, 300, 2),
    Signal('XLG_8#3', 82, 'right'),
    Junction('XLG#3', 83, u'Leopoldgrün'),
    Signal('XLG_13#3', 84, 'left'),
    OpenLine('XLG#3_XWF#3', 91, 1800, 2),
    Signal('XWF_F#3', 98, 'right'),
    Signal('XWF_N#3', 98, 'left'),
    Station('XWF#3', 99, u'Walfdorf'),
    Signal('XWF_P#3', 100, 'right'),
    Signal('XWF_A#3', 100, 'left'),
])
