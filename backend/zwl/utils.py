# -*- coding: utf8 -*-
from datetime import datetime, date

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
