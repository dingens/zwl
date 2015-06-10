#!/usr/bin/env python2
# -*- coding: utf8 -*-
"""
    zwl.extra.clockserver
    =====================

    Local clock server, usable for development

    :copyright: (c) 2015, Marian Sigler
    :license: GNU GPL 2.0 or later.
"""
import socket
from datetime import date, time, datetime
from zwl import app

class ClockServer(object):
    """
    Server implementing a basic variant of the clock protocol as spoken by
    `zwl.utils.ClockConnection`.
    """
    def __init__(self, current_time=None, running=True):
        self.clock = Clock(current_time, running)

    def listen(self, host=None, port=None):
        """
        Start the clock server.

        Note that this is non-threading (as it is not needed for testing).

        Host defaults to localhost, port defaults to the value set in the
        `CLOCK_SERVER` config option.
        """
        if host is None:
            host = 'localhost'
        if port is None:
            _, port = app.config['CLOCK_SERVER']

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Allow quick server restart. http://stackoverflow.com/a/4466035/196244
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(2)

        try:
            clientsock = None
            while True:
                clientsock, clientaddress = sock.accept()
                print 'Connection from %s:%d' % clientaddress
                conn = clientsock.makefile('rw')
                conn.write('100 EBuEf dev clock server\n')
                conn.flush()
                r = conn.readline()

                if r.rstrip() != 'get 1':
                    out = "500 unknown command"
                else:
                    time = self.clock.get_time().strftime('%s')
                    state = {'running':1, 'stopped':0}[self.clock.get_state()]
                    out = '200 1 %s 10 %d' % (time, state)

                print '>', out
                conn.write(out + '\n')
                conn.flush()

                try:
                    # may raise EBADF if already shut down
                    clientsock.shutdown(socket.SHUT_RDWR)
                except socket.error, e:
                    if e.errno != socket.EBADF:
                        raise
                clientsock.close()
        finally:
            if clientsock is not None:
                print 'close client'
                clientsock.close()
            print 'close'
            sock.close()


class Clock(object):
    """
    Helper class for ClockServer, managing time state.
    """
    def __init__(self, current_time=None, running=True):
        now = datetime.now() # ensure diff is 0 when current_time is None
        if current_time is None:
            current_time = now
        if isinstance(current_time, time):
            current_time = datetime.combine(date.today(), current_time)

        if running:
            self.state = 'running'
            self.diff = current_time - now
            self.current_time = None
        else:
            self.state = 'stopped'
            self.diff = None
            self.current_time = current_time

    def get_time(self):
        if self.state == 'running':
            return datetime.now() + self.diff
        if self.state == 'stopped':
            return self.current_time
        raise RuntimeError('invalid state for %r' % self)

    def get_state(self):
        assert self.state in ('running', 'stopped')
        return self.state

    def start(self):
        if self.state == 'running':
            return
        assert self.state == 'stopped'

        self.state = 'running'
        self.diff = self.current_time - datetime.now()
        self.current_time = None

    def stop(self):
        if self.state == 'stopped':
            return
        assert self.state == 'running'

        self.state = 'stopped'
        self.current_time = datetime.now() + self.diff
        self.diff = None

    def __repr__(self):
        if self.state == 'running':
            return '<ClockServer (running) now=%s diff=%s>' % (
                datetime.now() + self.diff, self.diff)
        if self.state == 'stopped':
            return '<ClockServer (stopped) now=%s diff=%s>' % (
                self.current_time, self.current_time - datetime.now())
        raise RuntimeError('invalid state: %r' % self.state)

if __name__ == '__main__':
    import sys
    if len(sys.argv) <= 1:
        print >>sys.stderr, 'Usage: clockserver.py ' \
            '{realtime|%Y-%m-%dT%H:%M:%S|unixtimestamp} [stopped]'
        sys.exit(1)

    running = True
    if len(sys.argv) > 2:
        if sys.argv[2] == 'stopped':
            print 'stopped'
            running = False
        else:
            print >>sys.stderr, 'argument 2, if present, must be `stopped`'
            sys.exit(1)

    if sys.argv[1] == 'realtime':
        cs = ClockServer(datetime.now(), running)
    elif '-' in sys.argv[1]:
        cs = ClockServer(datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%S'), running)
    else:
        cs = ClockServer(datetime.strptime(sys.argv[1], '%s'), running)

    try:
        cs.listen()
    except KeyboardInterrupt:
        pass # close is done by ClockServer
