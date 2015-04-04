# -*- coding: utf8 -*-


# GENERAL SETTINGS

# The database to connect to. For information about the url format, see
# http://docs.sqlalchemy.org/en/latest/core/engines.html#database-urls
SQLALCHEMY_DATABASE_URI = None

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


# PREDICTION MODULE RELATED SETTINGS

# Limit for the train time prediction (seconds from current time)
PREDICTION_INTERVAL = 7200 # 2h

# If is no minimal travel time given in the timetable, we approximate
# this assuming a constant factor.
# For example, with a ratio of 0.8 and a travel time of five minutes in the
# timetable, it is assumed a train can do this in four minutes.
MINIMUM_TRAVEL_TIME_RATIO = 0.9
