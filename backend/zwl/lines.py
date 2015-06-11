# -*- coding: utf8 -*-
"""
    zwl.lines
    =========

    Management of line configurations.

    :copyright: (c) 2015, Marian Sigler
    :license: GNU GPL 2.0 or later.
"""

from werkzeug.utils import cached_property

def get_lineconfig(lc):
    if lc is None:
        return lc

    if isinstance(lc, LineConfig):
        return lc

    return lineconfigs[lc]

class LineConfig(object):
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
        """All elements of the lineconfig that are not open line segments."""
        return [e for e in self.elements if isinstance(e, Loc)]

    def locations_extended_between(self, startpos=0, endpos=1):
        """
        Return all `locations` with `pos` between(*) `startpos` and `endpos`.

        * If no location is exactly at the given limits, one additional
        location is added at the beginning or end respectively, so that:
        `returnval[0].pos <= startpos and returnval[1].pos > startpos`
        and likewise with endpos.

        Floating point inaccuracy is taken care of.

        :return: generator of `Loc` (and subclasses) objects.
        """
        last = None
        # if we get 0.19999999999999 as startpos, and a location with pos=0.2
        # exists, we want this to be the first location, so we increase
        # startpos a little; likewise with endpos.
        startpos += 0.000000001
        endpos -= 0.000000001
        locs = iter(self.locations)
        for l in locs:
            if l.pos > startpos:
                if last is not None:
                    yield last
                yield l
                break
            last = l
        if l.pos > endpos:
            # in that special case we mustn't enter the loop below
            return
        for l in locs:
            yield l
            if l.pos > endpos:
                break

    def serialize(self):
        return dict(
            id=self.id,
            name=self.name,
            elements=[e.serialize() for e in self.elements],
        )

    def __repr__(self):
        return '<LineConfig %s #elem=%d>' % (self.id, len(self.elements))


class Elem(object):
    """Baseclass for all lineconfig element types. Not to be used directly."""
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
    """
    Baseclass for all lineconfig element types that are points (ie no open line)
    """
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
    display_label = True

class Siding(Loc):
    typecode = 'anst'
    display_label = False

lineconfigs = {}
def add_lineconfig(*args, **kwargs):
    l = LineConfig(*args, **kwargs)
    assert l.id not in lineconfigs
    lineconfigs[l.id] = l

add_lineconfig('sample', u'Beispielsträcke', [
    Station('XDE#1', 0, u'Derau'),
    OpenLine('XDE#1_XCE#1', 15, 3000, 2),
    Station('XCE#1', 30, u'Cella'),
    OpenLine('XCE#1_XLG#1', 40, 2000, 2),
    Junction('XLG#1', 50, u'Leopoldgrün'),
    OpenLine('XLG#1_XBG#2', 65, 1000, 2),
    Station('XBG#2', 60, u'Berg'),
    OpenLine('XBG#2_XDE#2', 80, 4000, 2),
    Station('XDE#2', 100, u'Derau'),
])

add_lineconfig('ring-xwf', u'Ring, XWF-XCE-XDE-XBG-XWF', [
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
    Siding('XBA_A#3', 68, u'Anst Stadt Berg'),
    OpenLine('XBA#3_XBG#3', 70, 500, 2),
    Signal('XBG_F#3', 72, 'right'),
    Signal('XBG_N#3', 72, 'left'),
    Station('XBG#3', 73, u'Berg'),
    Signal('XBG_P#3', 74, 'right'),
    Signal('XBG_A#3', 74, 'left'),
    OpenLine('XBG#3_XLG#3', 78, 300, 2),
    Signal('XLG_8#3', 82, 'right'),
    Junction('XLG#3', 83, u'Leopoldsgrün'),
    Signal('XLG_13#3', 84, 'left'),
    OpenLine('XLG#3_XWF#3', 91, 1800, 2),
    Signal('XWF_F#3', 98, 'right'),
    Signal('XWF_N#3', 98, 'left'),
    Station('XWF#3', 99, u'Walfdorf'),
    Signal('XWF_P#3', 100, 'right'),
    Signal('XWF_A#3', 100, 'left'),
])

add_lineconfig('ring-xde', u'Ring, XDE-XBG-XWF-XCE-XDE', [
    Signal('XDE_F#1', 0, 'right'),
    Signal('XDE_N#1', 0, 'left'),
    Station('XDE#1', 1, u'Derau'),
    Signal('XDE_P#1', 2, 'right'),
    Signal('XDE_A#1', 2, 'left'),
    OpenLine('XDE#1_XSBK4#2', 5, 500, 2),
    Signal('XSBK4#2', 7, 'right'),
    OpenLine('XSBK4#2_XSBK4#2', 8, 500, 2),
    Signal('XSBK3#2', 10, 'left'),
    OpenLine('XSBK3#2_XSBK2#2', 11, 500, 2),
    Signal('XSBK2#2', 13, 'right'),
    OpenLine('XSBK2#2_XSBK1#2', 14, 500, 2),
    Signal('XSBK1#2', 16, 'left'),
    OpenLine('XSBK1#2_XBA#2', 22, 2000, 2),
    Siding('XBA_A#2', 29, u'Anst Stadt Berg'),
    OpenLine('XBA#2_XBG#2', 31, 500, 2),
    Signal('XBG_F#2', 33, 'right'),
    Signal('XBG_N#2', 33, 'left'),
    Station('XBG#2', 34, u'Berg'),
    Signal('XBG_P#2', 35, 'right'),
    Signal('XBG_A#2', 35, 'left'),
    OpenLine('XBG#2_XLG#2', 39, 300, 2),
    Signal('XLG_8#2', 43, 'right'),
    Junction('XLG#2', 44, u'Leopoldsgrün'),
    Signal('XLG_13#2', 45, 'left'),
    OpenLine('XLG#2_XWF#2', 52, 1800, 2),
    Signal('XWF_F#2', 59, 'right'),
    Signal('XWF_N#2', 59, 'left'),
    Station('XWF#2', 60, u'Walfdorf'),
    Signal('XWF_P#2', 61, 'right'),
    Signal('XWF_A#2', 61, 'left'),
    OpenLine('XWF#2_XCE#2', 67, 1000, 2),
    Signal('XCE_F#2', 74, 'right'),
    Signal('XCE_N#2', 74, 'left'),
    Station('XCE#2', 75, u'Cella'),
    Signal('XCE_P#2', 76, 'right'),
    Signal('XCE_A#2', 76, 'left'),
    OpenLine('XCE#2_XAP#2', 84, 1800, 2),
    Signal('XAP_B#2', 88, 'right'),
    BlockPost('XAP#2', 89, u'Alp'),
    Signal('XAP_A#2', 90, 'left'),
    OpenLine('XAP#2_XDE#3', 93, 1300, 2),
    Signal('XDE_F#3', 98, 'right'),
    Signal('XDE_N#3', 98, 'left'),
    Station('XDE#3', 99, u'Derau'),
    Signal('XDE_P#3', 100, 'right'),
    Signal('XDE_A#3', 100, 'left'),
])


add_lineconfig('xab-xws', u'XAB-XLG-XWF-XWS', [
    #TODO distances XAB--XPN
    Station('XAB#1', 0, u'Ausblick'),
    Signal('XAB_P#1', 2, 'right'),
    Signal('XAB_A#1', 2, 'left'),
    OpenLine('XAB#1_XZO#1', 8, 1000),
    Signal('XZO_F#1', 14, 'right'),
    Signal('XZO_N#1', 14, 'left'),
    Station('XZO#1', 16, u'Zoo'),
    Signal('XZO_P#1', 18, 'right'),
    Signal('XZO_A#1', 18, 'left'),
    OpenLine('XZO#1_XDR#1', 23, 1000),
    Signal('XDR_F#1', 28, 'right'),
    Signal('XDR_N#1', 28, 'left'),
    Station('XDR#1', 30, u'Drewitz'),
    Signal('XDR_P#1', 32, 'right'),
    Signal('XDR_A#1', 32, 'left'),
    OpenLine('XDR#1_XPN#1', 40, 1000),
    Signal('XPN_D#1', 48, 'right'),
    Signal('XPN_C#1', 48, 'left'),
    Station('XPN#1', 50, u'Pörsten'),
    Signal('XPN_B#1', 52, 'right'),
    Signal('XPN_A#1', 52, 'left'),
    OpenLine('XPN#1_XTS#1', 56, 1100, 1),
    Signal('XTS_12#1', 60, 'right'),
    Junction('XTS#1', 62, 'Tessin'),
    Signal('XTS_11#1', 64, 'left'),
    OpenLine('XTS#1_XLG#1', 69, 1000, 1),
    Signal('XLG_4#1', 73, 'right'),
    Junction('XLG#1', 75, u'Leopoldsgrün'),
    Signal('XLG_13#1', 77, 'left'),
    OpenLine('XLG#1_XWF#1', 83, 1800, 2),
    Signal('XWF_F#1', 89, 'right'),
    Signal('XWF_N#1', 89, 'left'),
    Station('XWF#1', 91, u'Walfdorf'),
    Signal('XWF_P#1', 93, 'right'),
    Signal('XWF_B#1', 93, 'left'),
    OpenLine('XWF#1_XWS#1', 96, 500, 1), #TODO: no open line (bahnhofsteil)
    Station('XWS#1', 100, u'Walfdorf-Spendenkasse'),
])
