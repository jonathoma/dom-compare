(function() {

    "use strict";

    var type = require('./node_types');
    var revxpath = require('./revxpath.js');

    var typeMap = {},
        comparatorTypeMap = {};

    typeMap[type.ATTRIBUTE_NODE] = "attribute";
    typeMap[type.ELEMENT_NODE] = "element";
    typeMap[type.TEXT_NODE] = "text node";
    typeMap[type.COMMENT_NODE] = "comment node";
    typeMap[type.CDATA_SECTION_NODE] = "CDATA node";
    typeMap[type.DOCUMENT_NODE] = "document";
    typeMap[type.DOCUMENT_FRAGMENT_NODE] = "document fragment";

    Object.keys(type).forEach(function(k) {
        comparatorTypeMap[type[k]] = k;
    });

    function Collector(options) {
        this._diff = [];
        this._options = options || {};
        this._numNodes = 0;
        this._numNodesDiff = 0;
    }

    Collector.prototype._describeNode = function(node) {
        if (node.nodeType == type.TEXT_NODE ||
            node.nodeType == type.CDATA_SECTION_NODE ||
            node.nodeType == type.COMMENT_NODE) {
            return "'" + (this._options.stripSpaces ? node.nodeValue.trim() : node.nodeValue) + "'";
        } else
            return "'" + node.nodeName + "'";
    };

    Collector.prototype.getDifferences = function() {
        return this._diff;
    };

    Collector.prototype.getResult = function() {
        return this._diff.length == 0;
    };
    
    Collector.prototype.getDiffNodes = function() {
        return this._numNodesDiff;
    }

    Collector.prototype.getTotalNodes = function() {
        return this._numNodes;
    }

    Collector.prototype.getSummary = function() {
        return this._numNodesDiff / this._numNodes;
    }

    Collector.prototype.collectFailure = function(expected, actual, collect = true) {

        var msg, canContinue = true,
            vExpected, vActual, ref = expected || actual,
            cmprtr, r;

        if (this._options.comparators && 
            (cmprtr = this._options.comparators[comparatorTypeMap[ref.nodeType]])) {
            if (!(cmprtr instanceof Array))
                cmprtr = [cmprtr];
            for (var i = 0, l = cmprtr.length; i < l; i++) {
                r = cmprtr[i](expected, actual);
                if (!r) {
                    continue;   
                }
                // true -> ignore differences. Stop immediately, continue;
                if (r === true) {
                    return true;
                }
                // string - treat as error message, continue;
                else if (typeof r == 'string') {
                    msg = r;
                    canContinue = true;
                }
                // object - .message = error message, .stop - stop flag
                else if (typeof r == 'object') {
                    msg = r.message;
                    canContinue = !(!!r.stop);
                }
                break;
            }
        }

        if (!msg) {
            if (expected && !actual) {
                msg = this._describeNode(expected) + " is missed";
                canContinue = true;
            } else if (!expected && actual) {
                msg = "Extra " + typeMap[actual.nodeType] + " " + this._describeNode(actual);
                canContinue = true;
            } else {
                if (expected.nodeType == actual.nodeType) {
                    if (expected.nodeName == actual.nodeName) {
                        vExpected = expected.nodeValue;
                        vActual = actual.nodeValue;
                        if (this._options.stripSpaces && expected.nodeType != type.CDATA_SECTION_NODE) {
                            vExpected = vExpected.trim();
                            vActual = vActual.trim();
                        }
                        if (vExpected == vActual)
                            throw new Error("Nodes are considered equal but shouldn't");
                        else {
                            switch (expected.nodeType) {
                                case type.ATTRIBUTE_NODE:
                                    msg = "Attribute '" + expected.nodeName + "': expected value '" + vExpected + "' instead of '" + vActual + "'";
                                    break;
                                case type.COMMENT_NODE:
                                    msg = "Expected comment value '" + vExpected + "' instead of '" + vActual + "'";
                                    break;
                                case type.CDATA_SECTION_NODE:
                                    msg = "Expected CDATA value '" + vExpected + "' instead of '" + vActual + "'";
                                    break;
                                case type.TEXT_NODE:
                                    msg = "Expected text '" + vExpected + "' instead of '" + vActual + "'";
                                    break;
                                default:
                                    msg = "Expected text '" + vExpected + "' instead of '" + vActual + "'";
                                    // throw new Error("nodeValue is not equal, but nodeType is unexpected");
                            }
                            canContinue = false;
                        }
                    } else {
                        msg = "Expected " + typeMap[expected.nodeType] +
                            " '" + expected.nodeName + "' instead of '" + actual.nodeName + "'";
                        canContinue = false;
                    }
                } else {
                    msg = "Expected node of type " + expected.nodeType +
                        " (" + typeMap[expected.nodeType] + ") instead of " +
                        actual.nodeType + " (" + typeMap[actual.nodeType] + ")";
                    canContinue = false;
                }
            }
        }

        if (collect) {
            this._diff.push({
                node: revxpath(ref.ownerElement || ref.parentNode),
                message: msg
            });
        }
        return canContinue;
    };

    module.exports = Collector;


})();
