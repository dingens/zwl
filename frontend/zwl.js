ZWL = {};

/*
Code layout remarks
===================

vocabulary notes.
* graph: a diagram
* line: a concatenation of stations and rail lines, and information about
  these elements. Corresponds roughly to German "Strecke"
* path: the image drawn inside a graph for one train. Must not be confused with `line`, see above.

class hierarchy.
* ZWL.Display is the main class. It contains all other elements, manages the
  overall layout and keeps the time.
* ZWL.TimeAxis draws a draggable time axis. By dragging it the time frame
  displayed in the graphs can be changed.
* ZWL.Graph is one graph of one line or line segment, containing the names of
  stations on the x axis and the train paths inside the graph. The portion of
  the line that is displayed can be varied. It does not modify time, only read
  the value set in Display by TimeAxis.
* ZWL.TrainDrawing is the class that maintains and draws one train path,
  updating it if the timetable changes etc.

*/


ZWL.Display = function (element, graphinfo, timezoom) {
    this.svg = SVG(element).translate(0.5, 0.5);
                            /* put lines in the middle of pixels -> sharper*/

    this.timezoom = defaultval(timezoom, .25); // pixels per second
    this.epoch = 13042800; // the time that corresponds to y=0
    this.now = 13092300;
    this.starttime = this.now - 600;
    this.endtime = null;

    this.timeaxis = new ZWL.TimeAxis(this);
    // TODO: generate dynamically using `graphinfo`
    this.graphs = [
        new ZWL.Graph(this, 'ring-xde', {})
    ];

    this.sizechange();
    // avoid resizing tons of times while the user drags the window
    that = this;
    $(window).resize(function () {
        window.clearTimeout(that.resizetimeout);
        that.resizetimeout = window.setTimeout(
            function () { that.sizechange(); },
            250);
    });
};

ZWL.Display.prototype = {
    sizechange: function (width,height) {
        if ( width == undefined && height == undefined) {
            width = $(window).width() - 25;
            height = 700;
        }
        this.width = width;
        this.height = height;
        this.svg.size(width,height);
        this.endtime = this.starttime + (this.height - this.measures.graphtopmargin
                       - this.measures.graphbottommargin) / this.timezoom;

        //TODO calculate useful arrangement depending on number of graphs etc
        var innerheight = height - this.measures.graphtopmargin - this.measures.graphbottommargin
        this.graphs[0].sizechange(60, this.measures.graphtopmargin,
            width-200,innerheight);
        this.timeaxis.sizechange(width-80,this.measures.graphtopmargin, 75,innerheight);
    },
    timechange: function () {
        // code to be executed whenever `starttime` changes
        // this runs lots of times while the user moves the time axis, so keep it short!

        this.graphs[0].timechange();
        this.timeaxis.timechange();
        this.endtime = this.starttime + (this.height - this.measures.graphtopmargin
                       - this.measures.graphbottommargin) / this.timezoom;

    },
    redraw: function () {
        this.graphs[0].redraw();
        this.timeaxis.redraw();
    },
    time2y: function (time) {
        return this.timezoom * (time - this.epoch);
    },
    y2time: function (y) {
        return y / this.timezoom + this.epoch;
    },
    measures: {
        graphtopmargin: 45,
        graphbottommargin: 45,
    },
};


ZWL.Graph = function (display, line, viewcfg) {
    this.display = display;
    //TODO: fetch real line detail
    this.line = ringxde;
    this.xstart = defaultval(viewcfg.xstart, 0);
    this.xend = defaultval(viewcfg.xend, 1);
    this.trains = {};
    this.svg = this.display.svg.group();

    this.trainboxframe = this.svg.rect(0,0).addClass('trainboxframe');
    this.traincliprect = this.svg.rect(0,0);
    this.trainclip = this.svg.clip().add(this.traincliprect);
    this.trainbox = this.svg.group().addClass('trainbox');

    this.nowmarker = this.trainbox.line(-1,-1,-1,-1).addClass('nowmarker')
        .clipWith(this.trainclip);

    this.pastblur = {};
    this.pastblur.group = this.trainbox.group().addClass('pastblur');
    this.pastblur.past = this.pastblur.group.rect(0,0).addClass('pastblur-past');
    this.pastblur.future = this.pastblur.group.rect(0,0)
        .addClass('pastblur-future');
    this.pastblur.mask = this.svg.mask().add(this.pastblur.group);

    this.locaxis = {};
    this.locaxis.g = this.svg.group().addClass('locaxis');
    this.locaxis.labels = this.locaxis.g.group();
    this.locaxis.bottom = this.svg.use(this.locaxis.labels).addClass('locaxis');

    for ( var i in this.line.elements ) {
        var loc = this.line.elements[i];
        if ( 'code' in loc ) {
            this.locaxis[loc.id] = this.locaxis.labels.plain(loc.code)
                .attr('title', loc.name);
        }
    }

    //TODO: provisory. should be draggable.
    var that = this;
    this.locaxis.leftleftbutton = this.locaxis.g.group().addClass('button')
        .add(this.svg.rect(20,20)).translate(-60,0)
        .add(this.svg.path('M 16,4 L 4,10 L 16,16 Z'))
        .click(function() { that.xstart +=.05; that.display.redraw(); });
    this.locaxis.leftrightbutton = this.locaxis.g.group().addClass('button')
        .add(this.svg.rect(20,20)).translate(-35,0)
        .add(this.svg.path('M 4,4 L 16,10 L 4,16 Z'))
        .click(function() { that.xstart -=.05; that.display.redraw(); });
    this.locaxis.rightleftbutton = this.locaxis.g.use(this.locaxis.leftleftbutton)
        .click(function() { that.xend +=.05; that.display.redraw(); });
    this.locaxis.rightrightbutton = this.locaxis.g.use(this.locaxis.leftrightbutton)
        .click(function() { that.xend -=.05; that.display.redraw(); });
};

ZWL.Graph.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        // position and dimensions of visible area
        this.x = x;
        this.y = y;
        this.boxwidth = width;
        this.boxheight = height;

        this.locaxis.rightleftbutton.translate(this.boxwidth+65);
        this.locaxis.rightrightbutton.translate(this.boxwidth+65);

        this.redraw();
    },
    timechange: function () {
        this.trainbox.translate(this.x, this.y - this.display.time2y(this.display.starttime));

        this.traincliprect
            .size(this.boxwidth,this.boxheight)
            .move(0,this.display.time2y(this.display.starttime));

        this.reposition_train_labels();
    },
    redraw: function () {
        // size of internal drawing (covering the whole line)
        this.drawwidth = this.boxwidth / (this.xend-this.xstart)
        this.trainboxframe
            .size(this.boxwidth, this.boxheight)
            .move(this.x, this.y)
            .back();

        this.timechange();

        this.locaxis.g.translate(this.x, this.y-this.measures.locaxisoverbox);
        this.locaxis.bottom.translate(this.x, this.y + this.boxheight
            + this.measures.locaxisunderbox);
        for ( var i in this.line.elements ) {
            var loc = this.line.elements[i];
            if ( 'code' in loc )
                this.locaxis[loc.id].move(this.pos2x(loc.id), 0);
        }

        this.pastblur.past
            .size(this.drawwidth, this.display.time2y(this.display.now))
            .move(this.pos2x(0), 0);
        this.pastblur.future
            .size(this.drawwidth, 999999)
            .move(this.pos2x(0), this.display.time2y(this.display.now));

        this.nowmarker.plot(this.pos2x(0),this.display.time2y(this.display.now),
                            this.pos2x(0)+this.drawwidth,this.display.time2y(this.display.now));

        this.fetch_trains();
        for ( var tid in this.trains ) {
            var train = this.trains[tid];
            if ( train.status == 'deleted' ) {
                train.drawing.remove();
            } else if ( train.status == 'new') {
                train.drawing = new ZWL.TrainDrawing(this, train);
            } else if ( train.status == 'updated') {
                train.drawing.update();
            }
        }
    },
    reposition_train_labels: function () {
        for ( var tid in this.trains ) {
            var train = this.trains[tid];
            train.drawing.update();
        }
    },
    _fetch_trains_called: false,
    fetch_trains: function () {
        if ( !this._fetch_trains_called ) {
            this.trains = {
                406: {'info':ice406, 'status': 'new'},
                2342: {'info':ire2342, 'status': 'new'},
                12345: {'info':rb12345, 'status': 'new'},
            }
        } else {
            for ( var tid in this.trains ) {
                this.trains[tid].status = 'updated';
            }
        }
        this._fetch_trains_called = true;
    },
    pos2x: function (id) {
        // allow values like xstart and xend as input
        if ( typeof(id) == 'number')
            return (id-this.xstart)*this.drawwidth;

        var elm = this.line.getElement(id);
        return (elm.pos-this.xstart) * this.drawwidth;
    },
    measures: {
        locaxisoverbox: 45,
        locaxisunderbox: 30,
        trainlabelxmargin: 5,
        trainlabelymargin: 2,
    }
};

ZWL.TimeAxis = function ( display ) {
    this.display = display;

    this.mask = this.display.svg.rect();
    this.svg = this.display.svg.group().clipWith(this.mask)
                                       .addClass('timeaxis');
    this.axis = this.svg.group().draggable(this.draggableconstraints)
                                .addClass('axis');
    this.bg = this.axis.rect().addClass('timeaxis-bg');

    this.zoombuttons = {}
    this.zoombuttons.g = this.svg.group().addClass('zoombuttons');
    this.zoombuttons.bg = this.zoombuttons.g.rect(55,30).addClass('bg');
    this.zoombuttons.plus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10 M 10,3 L 10,17'))
        .click(function() { display.timezoom *= Math.SQRT2; display.redraw(); });
    this.zoombuttons.minus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10'))
        .click(function() { display.timezoom /= Math.SQRT2; display.redraw(); });

    var that = this; // `this` is overridden in dragging functions
    this.axis.dragstart = function (delta, event) {
        this.addClass('grabbing');
    }
    this.axis.dragmove = function (delta, event) {
        var old = that.display.starttime;
        that.display.starttime = that.display.y2time((-this.transform().y));
        that.display.timechange();
    };
    this.axis.dragend = function (delta, event) {
        this.removeClass('grabbing');
        that.display.redraw();
    };

    this.times = {}
}

ZWL.TimeAxis.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.redraw();
    },
    timechange: function () {
        this.axis.translate(0, -this.display.time2y(this.display.starttime));
    },
    redraw: function () {
        this.timechange();
        this.svg.translate(this.x,this.y);
        this.mask.size(this.width,this.height).move(0,0);

        // we draw everything about one extra screen height to the top and
        // bottom (for scrolling)
        this.bg.size(this.width*2,this.height*3)
               .move(-this.width/2, this.display.time2y(this.display.starttime) - this.height);
        for ( var time in this.times ) {
            this.times[time].remember('unused', true);
        }
        var onescreen = this.height / this.display.timezoom;
        var time = Math.floor((this.display.starttime - onescreen) / 60) * 60
        var end = time + 3*onescreen + 120;
        var t, text, line;
        for ( ; time < end; time += 60 ) {
            if ( !(time in this.times )) {
                t = this.times[time] = this.axis.group();
                if ( (time % 600) == 0 ) {
                    text = t.plain(timeformat(time, 'hm'));
                    text.move(20, -text.bbox().height / 2);
                    t.remember('text', text);
                }
                if ( (time % 300) == 0)
                    line = t.line(5,0, 15,0);
                else
                    line = t.line(10,0, 15,0);
                t.remember('line', line.attr('title', timeformat(time, 'hm')));
            }
            this.times[time].translate(0, this.display.time2y(time))
                            .remember('unused', null);
        }

        for ( time in this.times )
            if (this.times[time].remember('unused')) {
                this.times[time].remove();
                delete this.times[time];
            }

        this.zoombuttons.plus.translate(this.width-50,this.height-25);
        this.zoombuttons.minus.translate(this.width-25,this.height-25);
        this.zoombuttons.bg.translate(this.width-55,this.height-30);
    },

    draggableconstraints: function (x, y) {
        return {x: x == 0, y: true}; //TODO use end of timetable
    },
}

ZWL.TrainInfo = function (gattung, nr, timetable, direction, comment) {
    this.gattung = gattung;
    this.nr = nr;
    this.timetable = timetable;
    this.direction = direction;
    this.comment = comment;
    this.name = this.gattung + ' ' + this.nr.toString();
}

ZWL.TrainDrawing = function (graph, train) {
    this.graph = graph;
    this.display = graph.display;
    this.train = train;
    this.points = null;
    this.svg = this.graph.trainbox.group()
        .addClass('trainpathg').addClass('train' + train.info.nr)
        .attr('title', train.info.name)
        .mouseover(function(){ this.front(); });

    this.trainpath = this.svg.polyline([[-1,-1]]).addClass('trainpath')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);
    // bg = invisible, thicker path to allow easier pointing
    this.trainpathbg = this.svg.polyline([[-1,-1]]).addClass('trainpathbg')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);

    this.label = {}
    this.label.g = this.svg.group().addClass('trainlabel');
    this.label.nr = this.label.g.plain(this.train.info.nr)
        .move(this.graph.measures.trainlabelxmargin,
              this.graph.measures.trainlabelymargin);
    var bb = this.label.nr.bbox();
    this.label.box = this.label.g.rect(
        bb.width+this.graph.measures.trainlabelxmargin*2,
        bb.height+this.graph.measures.trainlabelymargin*2).back();
    this.label.entry = this.svg.use(this.label.g);
    this.label.exit = this.svg.use(this.label.g);
    this.update();
}

ZWL.TrainDrawing.prototype = {
    update: function () {
        var tt = this.train.info.timetable;
        this.points = [];
        for ( var elm in tt ) {
            if ( tt[elm]['loc'] ) {
                if ( tt[elm]['arr_real'] != undefined )
                    this.points.push([tt[elm]['loc'],
                                      tt[elm]['arr_real']]);
                if ( tt[elm]['dep_real'] != undefined &&
                     tt[elm]['dep_real'] != tt[elm]['arr_real'] )
                    this.points.push([tt[elm]['loc'],
                                      tt[elm]['dep_real']]);

                laststop = tt[elm];
            }
        }

        this.redraw();
    },
    redraw: function () {
        var coordinates = this.points.map(function (p) {
            return [this.graph.pos2x(p[0]), this.display.time2y(p[1])];
        }, this);
        this.trainpath.plot(coordinates);
        this.trainpathbg.plot(coordinates);

        this.reposition_label('entry', this.label.entry);
        this.reposition_label('exit', this.label.exit);
    },
    reposition_label: function (mode, label) {
        if ( mode != 'entry' && mode != 'exit' )
            return console.error('no such mode: ' + mode);

        var points;
        if ( mode == 'entry') {
            points = this.points;
        } else if ( mode == 'exit') {
            // start searching in the other direction
            points = this.points.slice().reverse();
        }

        var x = y = orientation = null;

        // first, check the simple case: train start/stops within graph
        // this avoids calculating tons of intersections where there are none.
        // (`firststop` refers to the last element in the `exit` case.)
        var firststop_pos = this.graph.line.getElement(points[0][0]).pos;
        if ( points[0][1].within(this.display.starttime, this.display.endtime)
             && firststop_pos.within(this.graph.xstart, this.graph.xend) ) {
            x = this.graph.pos2x(firststop_pos);
            y = this.display.time2y(points[0][1]);
            if ( mode == 'entry' )
                orientation = this.train.info.direction == 'left' ? 'right' : 'left';
            else
                orientation = this.train.info.direction;
        }
        //TODO prevent execution of the else branch when the train is entirely outside the box
        else {
            var x1, y1, x2, y2, int_x, int_y;
            var left_x = this.graph.pos2x(this.graph.xstart);
            var right_x = this.graph.pos2x(this.graph.xend);
            var top_y = this.display.time2y(this.display.starttime);
            var bottom_y = this.display.time2y(this.display.endtime);

            for ( var i = 1; i < this.points.length; i++ ) {
                x1 = this.graph.pos2x(this.points[i-1][0]);
                x2 = this.graph.pos2x(this.points[i][0]);
                y1 = this.display.time2y(this.points[i-1][1]);
                y2 = this.display.time2y(this.points[i][1]);

                // intersection with top / bottom / left / right edge, respectively
                if ( mode == 'entry' ) {
                    if ( int_x = intersecthorizseg(top_y, left_x, right_x, x1,y1,x2,y2) ) {
                        x = int_x, y = top_y, orientation = 'top'; break;
                    }
                } else {
                    if ( int_x = intersecthorizseg(bottom_y, left_x, right_x, x1,y1,x2,y2) ) {
                        x = int_x, y = bottom_y, orientation = 'bottom'; break;
                    }
                }
                if ( this.train.info.direction == 'right' ? mode == 'entry' : mode == 'exit' ) {
                    if ( int_y = intersectvertseg(left_x, top_y, bottom_y, x1,y1,x2,y2) ) {
                        x = left_x, y = int_y, orientation = 'left'; break;
                    }
                } else {
                    if ( int_y = intersectvertseg(right_x, top_y, bottom_y, x1,y1,x2,y2) ) {
                        x = right_x, y = int_y, orientation = 'right'; break;
                    }
                }
            }
        }

        if ( x == null || y == null || orientation == null ) {
            console.log('no position for ' + this.train.info.nr + ' ' + mode
                        + ' label defined, removing');
            label.translate(100, 100);
        } else {
            x = Math.floor(x); y = Math.floor(y); // avoid lines "between pixels"
            console.log('draw', this.train.info.nr, x, y, orientation);
            var bb = label.bbox();
            if ( orientation == 'left') {
                label.translate(x-bb.width-5,y-bb.height/2);
            } else if ( orientation == 'right') {
                label.translate(x+5,y-bb.height/2);
            } else if ( orientation == 'top') {
                label.translate(x-bb.width/2,y-bb.height-5);
            } else if ( orientation == 'bottom') {
                label.translate(x-bb.width/2,y+5);
            }
        }
    },

    remove: function () {
        this.svg.remove();
    },
}

ZWL.LineConfiguration = function(name, elements) {
    this.name = name;
    this.elements = elements;
}

ZWL.LineConfiguration.prototype = {
    getElement: function ( id ) {
        //TODO: speed this up by caching this in an object
        for ( var i in this.elements )
            if ( this.elements[i].id == id )
                return this.elements[i];
        console.error('no such element', id);
        return undefined;
    },
}

// HELPERS

function defaultval(val, def) {
    return val === undefined ? def : val;
}

function coalesce() {
    for(var i in arguments)
        if (arguments[i] !== null && arguments[i] !== undefined)
            return arguments[i];
    return null;
}

function timeformat (time, format) {
    var d = new Date(time*1000);
    if ( format == 'hm')
        return d.getHours() + ':' + d.getMinutes();
    else
        console.error('invalid format given');
}

if (!Number.between) {
    Object.defineProperty(Number.prototype, 'between', {
        enumerable: false,
        value: function (a, b) {
            return this > a && this < b;
        },
    });
}

if (!Number.within) {
    Object.defineProperty(Number.prototype, 'within', {
        enumerable: false,
        value: function (a, b) {
            return this >= a && this <= b;
        },
    });
}

function intersecthorizseg(y, xa, xb, x1, y1, x2, y2) {
    // Calculate the x coordinate of the point were the line segment between
    // x1,y1 and x2,y2 intersects with the line segment from xa,y to xb,y.
    // If they don't intersect, return null.
    // It is required that xa < xb.

    // avoid complex calculations when they clearly don't intersect
    if ( Math.max(x1, x2) < xa || Math.min(x1, x2) > xb
         || Math.max(y1, y2) < y || Math.min(y1, y2) > y)
        return null;

    // equation deduced from P(t) = (x1+t*(x2-x1), y1+t*(y2-y1))
    var int_x = x1 + (y-y1)*(x2-x1)/(y2-y1);
    if (int_x + 0.000001 < xa || int_x - 0.000001 > xb)
        return null;

    return int_x;
}
function intersectvertseg(x, ya, yb, x1, y1, x2, y2) {
    // Calculate the y coordinate of the point were the line segment between
    // x1,y1 and x2,y2 intersects with the line segment from x,ya to x,yb.
    // If they don't intersect, return null.
    // It is required that ya < yb.
    return intersecthorizseg(x, ya, yb, y1, x1, y2, x2);
}


// some data for playing around (later to be fetched from the server)
ringxde = new ZWL.LineConfiguration('Ring (ab Derau)', [
    {'type':'bhf', 'id':'XDE#1', 'pos':0, code:'XDE', 'name':'Derau'},
    {'type':'str', 'id':'XDE#1_XCE#1', 'pos':.15, 'length':3000, 'tracks':2},
    {'type':'bhf', 'id':'XCE#1', 'pos':.3, code:'XCE', 'name':'Cella'},
    {'type':'str', 'id':'XCE#1_XLG#1', 'pos':.4, 'length':2000, 'tracks':2},
    {'type':'bhf', 'id':'XLG#1', 'pos':.5, code:'XLG', 'name':'Leopoldgrün'},
    {'type':'str', 'id':'XLG#1_XDE#2', 'pos':.75, 'length':5000, 'tracks':2},
    {'type':'bhf', 'id':'XDE#2', 'pos':1, code:'XDE', 'name':'Derau'},
]);
ice406 = new ZWL.TrainInfo('ICE', 406, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091820},
    {'str':'XDE#1_XCE#1'},
    {'loc':'XCE#1', 'arr_real':13092000, 'dep_real':13092060},
    {'str':'XCE#1_XLG#1'},
    {'loc':'XLG#1', 'arr_real':null, 'dep_real':13092300},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092600, 'dep_real':null},
], 'right');
ire2342 = new ZWL.TrainInfo('IRE', 2342, [
    {'loc':'XDE#2', 'arr_real':null, 'dep_real':13092240},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XLG#1', 'arr_real':13092540, 'dep_real':13092540},
], 'left');
rb12345 = new ZWL.TrainInfo('RB', 12345, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091800},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092260, 'dep_real':null},
], 'right');
