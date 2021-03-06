'use strict';

var assert = require('../../support/assert');
var step = require('step');
var LayergroupToken = require('../../../lib/models/layergroup-token');
var testHelper = require('../../support/test-helper');
const createServer = require('../../../lib/server');
var serverOptions = require('../../../lib/server-options');
const mapnik = require('@carto/mapnik');
var IMAGE_TOLERANCE_PER_MIL = 10;

describe('turbo-carto for named maps', function () {
    var server;

    before(function () {
        server = createServer(serverOptions);
    });

    var keysToDelete;

    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var templateId = 'turbo-carto-template-1';

    function template (table) {
        return {
            version: '0.0.1',
            name: templateId,
            auth: { method: 'open' },
            placeholders: {
                color: {
                    type: 'css_color',
                    default: 'Reds'
                }
            },
            layergroup: {
                version: '1.0.0',
                layers: [
                    {
                        options: {
                            sql: [
                                'SELECT ' + table + '.*, _prices.price FROM ' + table + ' JOIN (' +
                                '  SELECT 1 AS cartodb_id, 10.00 AS price',
                                '  UNION ALL',
                                '  SELECT 2, 10.50',
                                '  UNION ALL',
                                '  SELECT 3, 11.00',
                                '  UNION ALL',
                                '  SELECT 4, 12.00',
                                '  UNION ALL',
                                '  SELECT 5, 21.00',
                                ') _prices ON _prices.cartodb_id = ' + table + '.cartodb_id'
                            ].join('\n'),
                            cartocss: [
                                '#layer {',
                                '  marker-fill: ramp([price], colorbrewer(<%= color %>));',
                                '  marker-allow-overlap:true;',
                                '}'
                            ].join('\n'),
                            cartocss_version: '2.0.2'
                        }
                    }
                ]
            }
        };
    }

    var templateParamsReds = { color: 'Reds' };
    var templateParamsBlues = { color: 'Blues' };

    var scenarios = [
        {
            desc: 'with public tables',
            table: 'test_table'
        },
        {
            desc: 'with private tables',
            table: 'test_table_private_1'
        }
    ];

    scenarios.forEach(function (scenario) {
        it('should create a template with turbo-carto parsed properly: ' + scenario.desc, function (done) {
            step(
                function postTemplate () {
                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/named?api_key=1234',
                        method: 'POST',
                        headers: { host: 'localhost', 'Content-Type': 'application/json' },
                        data: JSON.stringify(template(scenario.table))
                    }, {},
                    function (res, err) {
                        next(err, res);
                    });
                },
                function checkTemplate (err, res) {
                    assert.ifError(err);
                    assert.strictEqual(res.statusCode, 200);
                    assert.deepStrictEqual(JSON.parse(res.body), {
                        template_id: templateId
                    });

                    return null;
                },
                function instantiateTemplateWithReds (err) {
                    assert.ifError(err);

                    var next = this;
                    assert.response(server, {
                        url: '/api/v1/map/named/' + templateId,
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(templateParamsReds)
                    }, {},
                    function (res, err) {
                        return next(err, res);
                    });
                },
                function checkInstanciationWithReds (err, res) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 200);

                    var parsedBody = JSON.parse(res.body);

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    assert.ok(parsedBody.layergroupid);
                    assert.ok(parsedBody.last_updated);

                    return parsedBody.layergroupid;
                },
                function requestTileReds (err, layergroupId) {
                    assert.ifError(err);

                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/' + layergroupId + '/0/0/0.png',
                        method: 'GET',
                        headers: { host: 'localhost' },
                        encoding: 'binary'
                    }, {},
                    function (res, err) {
                        next(err, res);
                    });
                },
                function checkTileReds (err, res) {
                    assert.ifError(err);

                    var next = this;

                    assert.strictEqual(res.statusCode, 200);
                    assert.strictEqual(res.headers['content-type'], 'image/png');

                    var fixturePath = './test/fixtures/turbo-carto-named-maps-reds.png';
                    var image = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                    assert.imageIsSimilarToFile(image, fixturePath, IMAGE_TOLERANCE_PER_MIL, next);
                },
                function instantiateTemplateWithBlues (err) {
                    assert.ifError(err);

                    var next = this;
                    assert.response(server, {
                        url: '/api/v1/map/named/' + templateId,
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(templateParamsBlues)
                    }, {},
                    function (res, err) {
                        return next(err, res);
                    });
                },
                function checkInstanciationWithBlues (err, res) {
                    assert.ifError(err);
                    assert.strictEqual(res.statusCode, 200);

                    var parsedBody = JSON.parse(res.body);

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    assert.ok(parsedBody.layergroupid);
                    assert.ok(parsedBody.last_updated);

                    return parsedBody.layergroupid;
                },
                function requestTileBlues (err, layergroupId) {
                    assert.ifError(err);

                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/' + layergroupId + '/0/0/0.png',
                        method: 'GET',
                        headers: { host: 'localhost' },
                        encoding: 'binary'
                    }, {},
                    function (res, err) {
                        next(err, res);
                    });
                },
                function checkTileBlues (err, res) {
                    assert.ifError(err);

                    var next = this;

                    assert.strictEqual(res.statusCode, 200);
                    assert.strictEqual(res.headers['content-type'], 'image/png');

                    var fixturePath = './test/fixtures/turbo-carto-named-maps-blues.png';
                    var image = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                    assert.imageIsSimilarToFile(image, fixturePath, IMAGE_TOLERANCE_PER_MIL, next);
                },
                function deleteTemplate (err) {
                    assert.ifError(err);

                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/named/' + templateId + '?api_key=1234',
                        method: 'DELETE',
                        headers: { host: 'localhost' }
                    }, {}, function (res, err) {
                        next(err, res);
                    });
                },
                function checkDeleteTemplate (err, res) {
                    assert.ifError(err);
                    assert.strictEqual(res.statusCode, 204);
                    assert.ok(!res.body);

                    return null;
                },
                function finish (err) {
                    done(err);
                }
            );
        });
    });
});
