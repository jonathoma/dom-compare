(function() {
    "use strict";

    var type = require('./node_types');
    var Collector = require('./collector');

    function Comparator(options, collector) {
        this._options = options || {};
        if (!collector)
            throw new Error("Collector instance must be specified");
        this._collector = collector;
    }

    Comparator.prototype._filterNodes = function(list) {
        var ret = [],
            i, l, item;
        for (i = 0, l = list.length; i < l; i++) {
            item = list.item(i);
            if (item.nodeType == type.COMMENT_NODE && !this._options.compareComments)
                continue;
            if (item.nodeType == type.TEXT_NODE && ("" + item.nodeValue).trim() == "")
                continue;
            ret.push(item);
        }
        return ret;
    };

    Comparator.prototype.compareNode = function(left, right) {
        this._collector._numNodes++;
        if (typeof left === 'string' || typeof right === 'string') {
            throw new Error('String comparison is not supported. You must parse string to document to perform comparison.');
        }
        if (left.nodeName !== right.nodeName || left.nodeType !== right.nodeType) {
            this._collector._numNodesDiff++;
            return this._collector.collectFailure(left, right);
        }
        switch (left.nodeType) {
            case type.DOCUMENT_NODE:
                if (this.compareNode(left.documentElement, right.documentElement)) {
                    return true;
                }
                this._collector._numNodesDiff++;
                return false;
            case type.ELEMENT_NODE:
                if (this._compareAttributes(left.attributes, right.attributes) &&
                    this._compareNodeList(left.childNodes, right.childNodes)) {
                    return true;
                } 
                this._collector._numNodesDiff++;
                return false;
            case type.TEXT_NODE:
                // fallthrough
            case type.CDATA_SECTION_NODE:
                // fallthrough
            case type.DOCUMENT_FRAGMENT_NODE:
                // fallthrough 
            case type.COMMENT_NODE:
                if (this._compareTextNode(left, right)) {
                    return true;
                }
                this._collector._numNodesDiff++;
                return false;
            default:
                throw Error("Node type " + left.nodeType + " comparison is not implemented");
        }
    };

    Comparator.prototype._compareNodeList = function(left, right) {
        var left_children = this._filterNodes(left),
            right_children = this._filterNodes(right),
            result = true;

        // Naive comparison
        if (this._simple) {
            let l = Math.max(left_children.length, right_children.length);
            for (let i = 0; i < l; i++) {
                if (left_children[i] && right_children[i]) { 
                    if (!this.compareNode(left_children[i], right_children[i])) { 
                        result = false; 
                    } 
                } else { 
                    this._collector.collectFailure(left_children[i], right_children[i]);
                    result = false;
                } 
            } 
            return result;
        }

        // Construct LCS grid
        let memo = [];
        for (let i = 0; i <= left_children.length; i++) {
            memo[i] = [];
            for (let j = 0; j <= right_children.length; j++) { 
                if (i === 0 || j === 0) {
                    memo[i][j] = 0;
                    continue;
                }
                if (this._compareShallow(left_children[i - 1], right_children[j - 1])) { 
                    memo[i][j] = memo[i - 1][j - 1] + 1;
                } else {
                    memo[i][j] = Math.max(memo[i - 1][j], memo[i][j - 1]);
                }
            }
        }
        let left_lcs = [];
        let right_lcs = [];
        let i = left_children.length;
        let j = right_children.length;
        while (i > 0 && j > 0) {
            if (this._compareShallow(left_children[i - 1], right_children[j - 1])) {
                left_lcs.unshift(left_children[i - 1]);
                right_lcs.unshift(right_children[j - 1]);
                i--;
                j--;
            } else if (memo[i - 1][j] > memo[i][j - 1]) {
                result = false;
                this._collector._numNodesDiff++;
                this._collector.collectFailure(left_children[i - 1], null);
                i--;
            } else {
                result = false;
                this._collector._numNodesDiff++;
                this._collector.collectFailure(null, right_children[j - 1]);
                j--;
            }
        }
        for (i = 0; i < left_lcs.length; i++) {
            if (!this.compareNode(left_lcs[i], right_lcs[i])) { 
                result = false; 
            }
        }
        return result; 
    }; 

    Comparator.prototype._compareShallow = function(left, right) {
        if (left.nodeName !== right.nodeName || left.nodeType !== right.nodeType) {
            return false;
        }
        if (left.nodeType !== type.ELEMENT_NODE) {
            return this._compareAttributes(left.attributes, right.attributes, false); 
        } else {
            return this._compareTextNode(left, right, false);
        }
    }

    Comparator.prototype._compareAttributes = function(expected, actual, collect=true) { 
        var aExpected = {}, aActual = {}, 
            i, l; 
        if (!expected && !actual) 
            return true; 
        for (i = 0, l = expected.length; i < l; i++) {
            aExpected[expected[i].nodeName] = expected[i];
        }
        for (i = 0, l = actual.length; i < l; i++) {
            aActual[actual[i].nodeName] = actual[i];
        }
        for (i in aExpected) {
            // both nodes has an attribute
            if (aExpected.hasOwnProperty(i) && aActual.hasOwnProperty(i)) {
                // but values is differ
                var vExpected = aExpected[i].nodeValue;
                var vActual = aActual[i].nodeValue;
                if (this._options.stripSpaces && aExpected[i].nodeType != type.CDATA_SECTION_NODE) {
                    vExpected = vExpected.trim();
                    vActual = vActual.trim();
                }
                if (vExpected !== vActual) {
                    if (!this._collector.collectFailure(aExpected[i], aActual[i], collect)) {
                        return false;
                    }
                }
                // remove to check for extra/missed attributes;
                delete aActual[i];
                delete aExpected[i];
            }
        }
        // report all missed attributes
        for (i in aExpected) {
            if (aExpected.hasOwnProperty(i))
                if (!this._collector.collectFailure(aExpected[i], null, collect))
                    return false;
        }
        // report all extra attributes
        for (i in aActual) {
            if (aActual.hasOwnProperty(i))
                if (!this._collector.collectFailure(null, aActual[i], collect))
                    return false;
        }
        return true;
    };

    Comparator.prototype._compareTextNode = function(left, right, collect=true) {
        if (left.nodeType == type.COMMENT_NODE && !this._options.compareComments)
            return true;
        let vLeft = "" + left.nodeValue;
        let vRight = "" + right.nodeValue;
        if (this._options.stripSpaces && left.nodeType !== type.CDATA_SECTION_NODE) {
            vLeft = vLeft.trim();
            vRight = vRight.trim();
        }
        if (vLeft !== vRight) {
            return this._collector.collectFailure(left, right, collect);
        }
        return true;
    }

    module.exports = function(a, b, simple, options) {
        var collector = new Collector(options);
        var comparator = new Comparator(options, collector);
        comparator._simple = simple;
        comparator.compareNode(a, b);
        return collector;
    };
})();
