ZWL = {};

ZWL.Display = function (element, graphinfo, timezoom) {
    this.svg = SVG(element).translate(0.5, 0.5);
                            /* put lines in the middle of pixels -> sharper*/

    this.timezoom = defaultval(timezoom, .2);
    this.now = 13092300;
    this.starttime = this.now - 600;
    
    // TODO: parse this
    this.graphs = [
        new ZWL.Graph(this, 'ring-xde', {})
    ];
    this.timeaxis = new ZWL.TimeAxis(this);

    this.sizechange($(document).width()-25, 700);
};

ZWL.Display.prototype = {
    sizechange: function (width,height) {
        this.width = width;
        this.height = height;
        this.svg.size(width,height);

        //TODO calculate useful arrangement
        this.graphs[0].sizechange(30,30,width-160,height-60);
        this.timeaxis.sizechange(width-100,30, 100,height-60);
    },
    redraw: function () {
        this.graphs[0].redraw();
        this.timeaxis.redraw();
    },
    time2y: function (time) {
        var d = new Date(defaultval(time, this.now)*1000);
        //TODO: base on start of session or something not epoch
        return this.timezoom * (d.getDay()*86400 + d.getHours()*3600 +
                                d.getMinutes()*60 + d.getSeconds());
    },
};


ZWL.Graph = function (display, strecke, viewcfg) {
    this.display = display;
    //TODO: fetch real strecke detail
    this.strecke = ringxde;
    this.xstart = defaultval(viewcfg.xstart, 0);
    this.xend = defaultval(viewcfg.xend, 1);
    this.trains = {};
    this.svg = this.display.svg.group();
    this.trainbox = this.svg.group().addClass('trainbox');

    this.trainboxframe = this.trainbox.rect(0,0).addClass('trainboxframe');
    this.nowmarker = this.trainbox.line(-1,-1,-1,-1).addClass('nowmarker');

    this.pastblur = {};
    this.pastblur.group = this.trainbox.group().addClass('pastblur');
    this.pastblur.past = this.pastblur.group.rect(0,0).addClass('pastblur-past');
    this.pastblur.future = this.pastblur.group.rect(0,0)
        .addClass('pastblur-future');
    this.pastblur.mask = this.svg.mask().add(this.pastblur.group);

    this.locaxis = {};
    this.locaxis.g = this.svg.group().addClass('locaxis');
    this.locaxis.bottom = this.svg.use(this.locaxis.g);

    for ( var i in this.strecke.elements ) {
        var loc = this.strecke.elements[i];
        if ( 'code' in loc ) {
            this.locaxis[loc.id] = this.locaxis.g.plain(loc.code)
                .attr('title', loc.name).move(-100,-100);
        }
    }
};

ZWL.Graph.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        // position and dimensions of visible area
        this.x = x;
        this.y = y;
        this.viswidth = width;
        this.visheight = height;
        this.redraw();
    },
    redraw: function () {
        // size of internal drawing (covering the whole strecke)
        this.drawwidth = this.viswidth / (this.xend-this.xstart)
        this.trainbox.translate(this.x, this.y - this.display.time2y(this.display.starttime));
        this.trainboxframe
            .size(this.viswidth, this.visheight)
            .move(this.pos2x(this.xstart),
                  this.display.time2y(this.display.starttime));

        this.locaxis.g.translate(this.x, this.y-this.measures.locaxisoverbox);
        this.locaxis.bottom.translate(0, this.visheight
            + this.measures.locaxisoverbox + this.measures.locaxisunderbox);
        for ( var i in this.strecke.elements ) {
            var loc = this.strecke.elements[i];
            if ( 'code' in loc )
                this.locaxis[loc.id].move(this.pos2x(loc.id), 0);
        }

        this.nowmarker.plot(0,this.display.time2y(),
                            this.drawwidth,this.display.time2y());
        this.pastblur.past.size(this.drawwidth, this.display.time2y());
        this.pastblur.future
            .size(this.drawwidth, 99999)
            .move(0, this.display.time2y());

        this.fetch_trains();
        for ( tid in this.trains ) {
            var train = this.trains[tid];
            if ( train.status == 'deleted' ) {
                train.drawing.remove();
            } else if ( train.status == 'new') {
                train.drawing = new ZWL.TrainDrawing(this, train);
            } else if ( train.status == 'updated') {
                train.drawing.redraw();
            }
        }
    },
    fetch_trains: function () {
        if ( !this.trains.length ) {
            this.trains = {
                406: {'info':ice406, 'status':'new'},
                2342: {'info':ire2342, 'status':'new'},
            }
        }
    },
    pos2x: function (id) {
        // allow values like xstart and xend as input
        if ( typeof(id) == 'number')
            return id*this.drawwidth;

        var elm;
        for ( var i in this.strecke.elements ) {
            elm = this.strecke.elements[i];
            if ( elm.id == id )
                return elm.pos * this.drawwidth;
        }
        console.error('no such stop: ' + id);
    },
    measures: {
        locaxisoverbox: 30,
        locaxisunderbox: 15,
    }
};

ZWL.TimeAxis = function ( display ) {
    this.display = display;

    this.mask = this.display.svg.rect();
    this.svg = this.display.svg.group().addClass('timeaxis').clipWith(this.mask);
    this.axis = this.svg.group();

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
    redraw: function () {
        this.axis.translate(this.x, this.y - this.display.time2y(this.display.starttime));

        this.mask.size(this.width,this.height).move(this.x,this.y);

        // we draw about one exta screen height to the top and bottom (for scrolling)
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
                    text.move(15, -text.bbox().height / 2);
                    t.remember('text', text);
                }
                if ( (time % 300) == 0)
                    line = t.line(0,0, 10,0);
                else
                    line = t.line(5,0, 10,0);
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
    },
}

ZWL.TrainInfo = function (gattung, nr, timetable, comment) {
    this.gattung = gattung;
    this.nr = nr;
    this.timetable = timetable;
    this.comment = comment;
    this.name = this.gattung + ' ' + this.nr.toString();
}

ZWL.TrainDrawing = function (graph, train) {
    this.graph = graph;
    this.train = train;
    this.svg = this.graph.trainbox.group()
        .maskWith(this.graph.pastblur.mask)
        .addClass('trainline').addClass('train' + train.info.nr)
        .attr('title', train.info.name);
    this.trainline = this.svg.polyline([[-1,-1]]).attr('title', this.train.info.name);
    this.redraw();
}

ZWL.TrainDrawing.prototype = {
    redraw: function () {
        var tt = this.train.info.timetable;
        var points = [];
        for ( var elm in tt ) {
            if ( tt[elm]['loc'] ) {
                if ( tt[elm]['arr_real'] != undefined )
                    points.push([this.graph.pos2x(tt[elm]['loc']),
                                 this.graph.display.time2y(tt[elm]['arr_real'])]);
                if ( tt[elm]['dep_real'] != undefined &&
                     tt[elm]['dep_real'] != tt[elm]['arr_real'] )
                    points.push([this.graph.pos2x(tt[elm]['loc']),
                                 this.graph.display.time2y(tt[elm]['dep_real'])]);

                this.trainline.plot(points);
                laststop = tt[elm];
            }
        }
    },
    remove: function () {
        this.svg.remove();
    },
}


function defaultval(val, def) {
    return val === undefined ? def : val;
}

function timeformat (time, format) {
    var d = new Date(time*1000);
    if ( format == 'hm')
        return d.getHours() + ':' + d.getMinutes();
    else
        console.error('invalid format given');
}

// some data for playing around (later to be fetched from the server)
ringxde = {
    'elements': [
        {'type':'bhf', 'id':'XDE#1', 'pos':0, code:'XDE', 'name':'Derau'},
        {'type':'str', 'id':'XDE#1_XCE#1', 'pos':.15, 'length':3000, 'tracks':2},
        {'type':'bhf', 'id':'XCE#1', 'pos':.3, code:'XCE', 'name':'Cella'},
        {'type':'str', 'id':'XCE#1_XLG#1', 'pos':.4, 'length':2000, 'tracks':2},
        {'type':'bhf', 'id':'XLG#1', 'pos':.5, code:'XLE', 'name':'Walfdorf'},
        {'type':'str', 'id':'XLG#1_XDE#2', 'pos':.75, 'length':5000, 'tracks':2},
        {'type':'bhf', 'id':'XDE#2', 'pos':1, code:'XDE', 'name':'Derau'},
    ],
};
ice406 = new ZWL.TrainInfo('ICE', 406, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091820},
    {'str':'XDE#1_XCE#1'},
    {'loc':'XCE#1', 'arr_real':13092000, 'dep_real':13092060},
    {'str':'XCE#1_XLG#1'},
    {'loc':'XLG#1', 'arr_real':null, 'dep_real':13092300},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092600, 'dep_real':null},
])
ire2342 = new ZWL.TrainInfo('IRE', 2342, [
    {'loc':'XDE#2', 'arr_real':null, 'dep_real':13092240},
    {'str':'XLG#1_XDE#2'},
    {'loc':'XLG#1', 'arr_real':null, 'dep_real':13092540},
])
