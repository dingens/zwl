# -*- coding: utf8 -*-
"""
    zwl.utils
    =========

    Various utility functions.

    :copyright: (c) 2015, Marian Sigler
    :license: GNU GPL 2.0 or later.
"""

import socket
import warnings
from contextlib import contextmanager
from datetime import datetime, date, timedelta
from zwl import app

def time2js(t):
    """
    Convert a datetime.time object to the format used in the frontend.
    """

    if t is None or t == '':
        return None

    #TODO after-midnight and weekday treatment
    return int(datetime.combine(date(1970, 6, 1), t).strftime('%s'))

def js2time(s):
    """
    Convert from format used in the frontend to a datetime.time object.
    """
    if s is None or s == '':
        return None

    #TODO after-midnight and weekday treatment
    return datetime.fromtimestamp(float(s)).time()

def timediff(a, b):
    """
    `a - b` for `datetime.time` objects.

    It is required that a > b and that both values are less than 8 hours apart.

    N.b.: in the future, special treatment for midnight-wrapping arguments may
    be added (thus `timediff(time(1), time(23))` may be valid, returning 2h).
    """
    _LIMIT = timedelta(hours=8)

    if a < b:
        #TODO midnight support
        raise ValueError("%r < %r" % (a, b))

    aa = datetime.combine(date(1,1,1), a)
    bb = datetime.combine(date(1,1,1), b)

    diff = aa - bb
    if diff > _LIMIT:
        raise ValueError('more than 8 hours apart: %r %r' % (a, b))

    return diff

def timeadd(t, delta):
    """
    `time + delta` for `datetime.time` objects.

    Arguments which cause the result being on another day are supported,
    however a `MidnightWarning` is issued in such a case.

    To ensure consistency, this should only be used with small delta values,
    thus, it is required that delta be less than 8 hours.
    """
    _LIMIT = timedelta(hours=8)
    _date = date(1,1,1)

    if abs(delta) > _LIMIT:
        raise ValueError('more than 8 hours: %r' % delta)

    dt = datetime.combine(_date, t)
    result = dt + delta

    if result.date() != _date:
        warnings.warn('result is on the next day: %r + %r' % (t, delta),
                MidnightWarning)

    return result.time()

class MidnightWarning(UserWarning):
    pass

def writable_namedtuple(name, slots):
    class WritableNamedtuple(object):
        __slots__ = slots
        def __init__(self, *args):
            if len(args) != len(self.__slots__):
                raise TypeError('expected %d arguments, got %d' %
                        (len(args), len(self.__slots__)))
            for i, s in enumerate(self.__slots__):
                setattr(self, s, args[i])

        def __iter__(self):
            # support `a,b,c =` style assignment
            for name in self.__slots__:
                yield getattr(self, name)

        def __repr__(self):
            return '%s%r' % (self.__class__.__name__, tuple(self))

    WritableNamedtuple.__name__ = name
    return WritableNamedtuple

class ClockConnection(object):
    """
    Connection to the clock server.

    Tries to give as detailed error messages as possible, raising
    ClockConnectionError.

    Usable as a context manager, it automatically closes the connection when the
    `with` block is being left.
    """
    clock_line = 1
    timeout = 5

    def __init__(self, clock_server=None):
        if clock_server is None:
            clock_server = app.config['CLOCK_SERVER']
        self._connect(clock_server)

    def _connect(self, clock_server):
        with self.catch_socket_errors('while connecting to clock'):
            self.sock = socket.create_connection(clock_server, self.timeout)
            self.conn = self.sock.makefile('rw')

        self.getline(assert_code=100)

    def get_time(self):
        self.sendline('get %d' % self.clock_line)
        _, reply = self.getline(assert_code=200)

        line, time, scale, state = reply.split(' ')

        state = ['stopped', 'running'][int(state)]
        assert int(line) == self.clock_line
        assert scale == '10' # this isn't used atm

        return state, int(time)

    def sendline(self, s):
        with self.catch_socket_errors('while sending query to clock'):
            self.conn.write(s + '\r\n')
            self.conn.flush()

    def getline(self, assert_code=None):
        with self.catch_socket_errors('while reading response from clock'):
            resp = self.conn.readline()

            if not resp:
                raise ClockConnectionError('Clock did not send a reply')

            try:
                code, data = resp.split(' ', 1)
                code = int(code)
            except ValueError:
                raise ClockConnectionError('Clock did not send a proper reply')
            if '\n' not in data:
                # conn is a file object, so it waits for a newline even if
                # the line is received in multiple packets
                raise ClockConnectionError('Clock did not send a proper reply')

            if assert_code:
                if code != assert_code:
                    raise ClockConnectionError('Clock did not send the expected '
                                               'status code')

        return code, data.rstrip('\r\n')

    def close(self):
        if hasattr(self, 'sock'):
            try:
                # may raise EBADF if already shut down
                self.sock.shutdown(socket.SHUT_RDWR)
            except socket.error, e:
                if e.errno != socket.EBADF:
                    raise
            self.sock.close()

    @contextmanager
    def catch_socket_errors(self, errormsg):
        try:
            try:
                yield
            except socket.timeout:
                raise ClockConnectionError('Timeout %s' % errormsg)
            except socket.error, e:
                raise ClockConnectionError('Error %s: %s' % (errormsg, e))
        except Exception:
            self.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self.close()


class ClockConnectionError(Exception):
    pass

def get_time():
    """
    Query the clock server for information on the current simulation time.

    @returns: (state, time) where `state` is one of 'running', 'stopped' and
              time is a `datetime` object.
    """
    with ClockConnection() as cc:
        state, timestamp = cc.get_time()

    time = datetime.fromtimestamp(timestamp)
    return state, time
