#!/usr/bin/env python2
# -*- coding: utf8 -*-
"""
    zwl.extra.clockserver
    =====================

    Start a local clock server for development

    :copyright: (c) 2015, Marian Sigler
    :license: GNU GPL 2.0 or later.
"""
import socket
from datetime import date, time, datetime

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
