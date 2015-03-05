# -*- coding: utf8 -*-


# GENERAL SETTINGS

# The database to connect to. For information about the url format, see
# http://docs.sqlalchemy.org/en/latest/core/engines.html#database-urls
SQLALCHEMY_DATABASE_URI = None

# Normally we use the session timetable tables, i.e. `fahrplan_sessionzuege`,
# Set this to False to use `fahrplan_zuege`.
USE_SESSION_TIMETABLE = True

# IP address or hostname and port of the clock server
CLOCK_SERVER = ('192.168.17.5', 4711)


# FRONTEND RELATED SETTINGS

# Colors for the different train categories (see `TrainType.category`).
TRAIN_COLOR_MAP_DARK = {'nv':'#f44', 'fv':'#48f', 'gv':'#2f6',
                        'lz':'#fff', 'sz':'#bd5', None:'#fff'}

# Number of seconds (int or float) to sleep before processing a request.
# This setting can be used to test the frontend's ability to cope with slow
# response times.
RESPONSE_DELAY = 0
