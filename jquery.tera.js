/**
 * @name        Tera Templates
 * @description jQuery template plugin
 * @version     2.1.3
 * @author      Konstantin Krylov
 * @link        https://github.com/ssipak/tera/tree/2.0
 * @license     Public domain
 */
(function($) {
  var STATEMENTS = [
        generateMatchPrefix(/^</,             evalOpenCurly),
        generateMatchPrefix(/^>/,             evalClosedCurly),
        generateMatchPrefix(/^else/,          evalElse),
        generateMatchPrefix(/^\/(if|unless)/, evalCloseIf),
        generateMatchPrefix(/^\/each/,        evalCloseEach),

        matchEach,          // {each [element[ as key][ at index] in ]array_or_hash}
        matchOpenCondition, // {[else-](if[-not]|unless)[-empty|-first|-last] [expr]}
        matchTemplate,      // {tmpl template_name}
        matchRawVariable,   // {raw var}
        matchEscVariable,   // {var.key[var2.key2[var3]].key4} | {esc var}
        matchJson           // {[raw-]json var}
      ]
    , STATEMENTS_COUNT = STATEMENTS.length;

  // Ищем выражение
  function searchTag(string) {
    var start = /(\s*)\{(\*?)/.exec(string);
    if (start === null) return null;

    var substringOffset = start.index + start[0].length
      , substring       = string.substr(substringOffset)
      , startOffset     = (start[2] ? 0 : start[1].length) + start.index
      , match;

    // Выражение {*} ?
    if (start[2]) {
      match = /^\}\s*/.exec(substring);
      if (match !== null) {
        return {start: startOffset, end: substringOffset + match[0].length, evaluate: evalNothing};
      }
    }

    for (var stmtInd=0; stmtInd<STATEMENTS_COUNT; stmtInd++) {
      match = STATEMENTS[stmtInd](substring);
      if (match !== null) {
        match.start = startOffset;
        match.end   = match.len + substringOffset;
        return match;
      }
    }

    return {start: substringOffset, end: substringOffset, evaluate: evalNothing};
  }

  function matchTagEnd(string) {
    var match = /^(\s*(\*?)\})\s*/.exec(string);
    if (match === null) return null;
    return match[2] ? match[0].length : match[1].length;
  }

  function skipSpaces(string) {
    return /^\s*/.exec(string)[0].length;
  }

  function matchOpenCondition(string) {
    //            1       2  3              4 5                     6
    var match = /^(else-)?(if(-not)?|unless)(-(empty|key|val(?:ue)?|(first|last)))?/.exec(string);
    if (match === null) return null;

    var substringOffset = match[0].length
      , substring       = string.substr(substringOffset)
      , ifElse          = match[1]
      , invert          = match[2] === 'if-not' || match[2] === 'unless'
      , len, expr;

    if (match[6]) { // {if-first} | {if-last}
      len = matchTagEnd(substring);
      if (len === null) return null;
      return {len: substringOffset + len, evaluate: evalIfFirstOrLast, invert: invert, ifElse: ifElse, pos: match[6]};
    }

    var spaces = skipSpaces(substring);
    if (spaces === 0) return null;
    substringOffset += spaces;
    substring = substring.substr(spaces);

    if (match[5] === 'empty') { // {if-empty array_or_object}
      expr = matchVariable(substring);
      if (expr === null) return null;
      len = matchTagEnd(substring.substr(expr.len));
      if (len === null) return null;
      return {len: substringOffset + expr.len + len, evaluate: evalIfEmpty, invert: invert, ifElse: ifElse, sub: expr};
    }

    expr = matchExpression(substring);
    if (expr === null) return null;

    if (!match[5]) { // {if expr}
      len = matchTagEnd(substring.substr(expr.len));
      if (len === null) return null;
      return {len: substringOffset + expr.len + len, evaluate: evalIf, invert: invert, ifElse: ifElse, sub: expr};
    }

    // {if-key key in array_or_object} | {if-val[ue] value in array_or_object}
    substringOffset += expr.len;
    substring = substring.substr(expr.len);
    var delimiter = substring.match(/^\s+in\s+/);
    if (delimiter === null) return null;
    delimiter = delimiter[0].length;
    substringOffset += delimiter;
    substring = substring.substr(delimiter);

    var sub = matchVariable(substring);
    if (sub === null) return null;
    len = matchTagEnd(substring.substr(sub.len));
    if (len === null) return null;
    return {len: substringOffset + sub.len + len, evaluate: evalIfKeyOrValue, invert: invert, ifElse: ifElse, ifKey: match[5]==='key', expr: expr, sub: sub};
  }

  function matchEach(string) {
    //                1   2          3        4            5        6
    var match = /^each(\s+((?!\d)\w+)(\s+as\s+((?!\d)\w+))?(\s+at\s+((?!\d)\w+))? in)?/.exec(string);
    if (match === null) return null;

    var elem = match[2]
      , key = match[4]
      , index = match[6]
      , substringOffset = match[0].length
      , substring = string.substr(substringOffset)
      , spaces = skipSpaces(substring);
    if (spaces === 0) return null;

    substringOffset += spaces;
    substring = substring.substr(spaces);
    match = matchVariable(substring);
    if (match === null) return null;

    substringOffset += match.len;
    substring = substring.substr(match.len);
    var len = matchTagEnd(substring);
    if (len === null) return null;

    return {len: substringOffset + len, evaluate: evalEach, sub: match, elem: elem, key: key, index: index};
  }

  function generateMatchPrefix(prefixRegExp, evaluate) {
    return function(string) {
      var match = prefixRegExp.exec(string);
      if (match === null) return null;
      var len = matchTagEnd(string.substr(match[0].length));
      if (len === null) return null;
      return {len: match[0].length + len, evaluate: evaluate};
    };
  }

  function matchTemplate(string) {
    var match = /^tmpl ([\w-]+)/.exec(string);
    if (match === null) return null;
    var id = match[1]
      , params = []
      , offset = match[0].length
      , substring = string.substr(offset)
      , len;

    while (true) {
      len = matchTagEnd(substring);
      if (len !== null) {
        offset += len;
        break;
      }
      var spaces = skipSpaces(substring);
      offset += spaces;
      substring = substring.substr(spaces);
      match = matchExpression(substring);
      if (match === null) return null;

      params.push(match);
      offset += match.len;
      substring = substring.substr(match.len);
    }
    if (len === null) return null;
    return {len: offset, evaluate: evalTemplate, id: id, params: params};
  }

  function matchRawVariable(string) {
    if (string.substr(0, 3) !== 'raw') return null;
    var spaces = skipSpaces(string.substr(3));
    if (spaces < 1) return null;

    var offset = 3 + spaces;
    var variable = matchVariable(string.substr(offset));
    if (variable === null) return null;

    offset += variable.len;
    var len = matchTagEnd(string.substr(offset));
    if (len === null) return null;
    return {len: offset + len,  evaluate: evalRawVariableInsert, sub: variable};
  }

  function matchEscVariable(string) {
    var offset = 0;
    if (string.substr(0, 3) === 'esc') {
      var spaces = skipSpaces(string.substr(3));
      if (spaces >= 1) {
        offset = 3 + spaces;
      }
    }

    var variable = matchVariable(string.substr(offset));
    if (variable === null) return null;

    offset += variable.len;
    var len = matchTagEnd(string.substr(offset));
    if (len === null) return null;
    return {len: offset + len, evaluate: evalEscVariableInsert, sub: variable};
  }

  function matchJson(string) {
    var offset = 0;
    var isRaw = false;
    if (string.substr(0, 4) === 'json') {
      var spaces = skipSpaces(string.substr(4));
      if (spaces === 0) {
        return null;
      }
      offset = 4 + spaces;
    }
    else if (string.substr(0, 8) === 'raw-json') {
      var spaces = skipSpaces(string.substr(8));
      if (spaces === 0) {
        return null;
      }
      offset = 8 + spaces;
      isRaw = true;
    }

    var variable = matchVariable(string.substr(offset));
    if (variable === null) return null;

    offset += variable.len;
    var len = matchTagEnd(string.substr(offset));
    if (len === null) return null;
    return {len: offset + len, evaluate: isRaw ? evalRawJsonInsert : evalEscJsonInsert, sub: variable};
  }

  function matchExpression(string) {
    var match = matchOperand(string);
    if (match === null) return null;

    var substringOffset = match.len;
    var substring = string.substr(substringOffset);
    var operands = [match];
    var operators = [];
    while (true) {
      var opOffset = skipSpaces(substring);
      var opMatch = matchOperator(substring.substr(opOffset));
      if (opMatch === null) break;

      opOffset += opMatch.len;
      opOffset += skipSpaces(substring.substr(opOffset));
      match = matchOperand(substring.substr(opOffset));
      if (match === null) break;

      opOffset += match.len;
      operators.push(opMatch.name);
      operands.push(match);

      substringOffset += opOffset;
      substring = substring.substr(opOffset);
    }
    return operands.length === 1
      ? match
      : {len: substringOffset, evaluate: evalExpression, operators: operators, operands: operands};
  }

  function matchOperator(string) {
    var match = /^([!=<>]=|[<>+-]|&&|\|\|)/.exec(string);
    return match === null ? null : {len: match[0].length, name: match[0]};
  }

  function matchOperand(string) {
    var funcs = [matchGroup, matchObject, matchArray, matchVariable, matchString, matchNumber];
    for (var funcIndex in funcs) {
      if (funcs.hasOwnProperty(funcIndex)) {
        var match = funcs[funcIndex](string);
        if (match !== null) return match;
      }
    }
    return null;
  }

  function matchGroup(string) {
    if (string.substr(0, 1) !== '(') return null;
    var match = matchExpression(string.substr(1));
    if (match === null) return null;
    if (string.substr(match.len + 1, 1) !== ')') return null;
    return {len: match.len + 2, evaluate: evalGroup, sub: match};
  }

  function matchFunction(string) {
    if (string.substr(0, 1) !== '(') return null;
    var args = [];
    var substringOffset = 1 + skipSpaces(string.substr(1));
    var substring = string.substr(substringOffset);
    if (substring.substr(0, 1) === ')') return {len: substringOffset+1, evaluate: evalFunction, args: args};

    var match = matchExpression(substring);
    if (match === null) return null;
    args.push(match);
    substringOffset += match.len;
    substring = substring.substr(match.len);

    var spaces = skipSpaces(substring);
    substringOffset += spaces;
    substring = substring.substr(spaces);

    while (true) {
      var nextChar = substring.substr(0,1);
      if (nextChar === ')') break;
      if (nextChar !== ',') return null;
      var argOffset = 1 + skipSpaces(substring.substr(1));

      match = matchExpression(substring.substr(argOffset));
      if (match === null) return null;
      args.push(match);

      argOffset += match.len;
      substringOffset += argOffset;
      substring = substring.substr(argOffset);

      spaces = skipSpaces(substring);
      substringOffset += spaces;
      substring = substring.substr(spaces);
    }
    return {len: substringOffset+1, evaluate: evalFunction, args: args};
  }

  function matchString(string) {
    var match = /^(['"])((?!\1)[^\\]|\\.)*\1/.exec(string);
    if (match === null) return match;
    return {len: match[0].length, evaluate: evalString, string: match[0]};
  }

  function matchNumber(string) {
    var match = /^(-?)(\d+|0)(.\d+)?/.exec(string);
    if (match === null) return null;
    return {len: match[0].length, evaluate: evalNumber, number: match[0]};
  }

  function matchVariable(string) {
    var match = /^(\$(keys|[$ikld]|)|(?!\d)\w+)/.exec(string);
    if (match === null) return null;
    var name = match[1]
      , substringOffset = match[0].length
      , substring = string.substr(substringOffset)
      , subs = [], sub;
    while (true) {
      sub = matchVariableComponent(substring);
      if (sub !== null) {
        subs.push(sub);
        substringOffset += sub.len;
        substring = substring.substr(sub.len);
        continue;
      }
      sub = matchFunction(substring);
      if (sub !== null) {
        subs.push(sub);
        substringOffset += sub.len;
        substring = substring.substr(sub.len);
        continue;
      }
      match = /^\.((?=[^\d])\w+)/.exec(substring);
      if (match !== null) {
        subs.push({evaluate: evalSubvariable, name: match[1]});
        var len = match[0].length;
        substringOffset += len;
        substring = substring.substr(len);
        continue;
      }
      break;
    }

    return {len: substringOffset, evaluate: evalVariable, name: name, subs: subs};
  }

  function matchVariableComponent(string) {
    if (string.substr(0,1) !== '[') return null;
    var sub = matchExpression(string.substr(1));
    if (sub === null) return null;
    if (string.substr(1 + sub.len, 1) !== ']') return null;
    return {len: 2 + sub.len, evaluate: evalVariableComponent, sub: sub};
  }

  function matchObject(string) {
    if (string.substr(0,1) !== '{') return null;

    var offset = 1
      , substring = string.substr(1)
      , obj = {};
    while (true) {
      var keyMatch = /^\s*(\w+)\s*(:?)\s*/.exec(substring);
      if (keyMatch === null) return null;
      var key = keyMatch[1]
        , colon = keyMatch[2]
        , len = keyMatch[0].length;
      offset += len;
      substring = substring.substr(len);

      if (colon) {
        var expr = matchExpression(substring);
        if (expr === null) return null;

        obj[key] = expr;
        offset += expr.len;
        substring = substring.substr(expr.len);
        var spaces = skipSpaces(substring);
        offset += spaces;
        substring = substring.substr(spaces);
      } else {
        obj[key] = {len: 0, evaluate: evalVariable, name: key, subs: []};
      }

      var nextChar = substring.substr(0,1);
      if (nextChar === '}') {
        offset += 1;
        substring = substring.substr(1);
        break;
      }
      if (nextChar !== ',') return null;

      offset += 1;
      substring = substring.substr(1);
    }

    return {len: offset, evaluate: evalObject, object: obj};
  }

  function matchArray(string) {
    if (string.substr(0,1) !== '[') return null;

    var offset = 1;
    var substring = string.substr(1);
    var arr = [];
    while (true) {
      var spaces = skipSpaces(substring);
      offset += spaces;
      substring = substring.substr(spaces);

      var expr = matchExpression(substring);
      if (expr === null) return null;

      arr.push(expr);
      offset += expr.len;
      substring = substring.substr(expr.len);

      spaces = skipSpaces(substring);
      offset += spaces;
      substring = substring.substr(spaces);

      var nextChar = substring.substr(0,1);
      if (nextChar === ']') {
        offset += 1;
        substring = substring.substr(1);
        break;
      }
      if (nextChar !== ',') return null;

      offset += 1;
      substring = substring.substr(1);
    }

    return {len: offset, evaluate: evalArray, array: arr};
  }

  function evalNothing()            { return ''; }
  function evalEscVariableInsert()  { return '"+this.escape(' + this.sub.evaluate.apply(this.sub, arguments) + ')+"'; }
  function evalRawVariableInsert()  { return '"+' + this.sub.evaluate.apply(this.sub, arguments) + '+"'; }
  function evalRawJsonInsert()      { return '"+this.json(' + this.sub.evaluate.apply(this.sub, arguments) + ')+"'; }
  function evalEscJsonInsert()      { return '"+this.escape(this.json(' + this.sub.evaluate.apply(this.sub, arguments) + '))+"'; }
  function evalVariable()           {
    var result = (/^\$/.test(this.name) ? this.name : 'local.' + this.name)
      , subsCount = this.subs.length;
    for (var i=0; i<subsCount; i++) {
      var sub = this.subs[i];
      result += sub.evaluate.apply(sub, arguments);
    }
    return result;
  }
  function evalSubvariable()        { return '.' + this.name; }
  function evalVariableComponent()  { return '[' + this.sub.evaluate.apply(this.sub, arguments) + ']'; }
  function evalGroup()              { return '(' + this.sub.evaluate.apply(this.sub, arguments) + ')'; }
  function evalString()             { return this.string; }
  function evalNumber()             { return this.number; }

  function evalOpenCurly()          { return '{'; }
  function evalClosedCurly()        { return '}'; }
  function evalElse()               { return '";}else{retval+="'; }
  function evalCloseIf()            { return '"}retval+="'; }
  function evalCloseEach()          { return '";$i++}}).call(this,$it,$t);retval+="'; }

  function genEvalIf(ifElse, condition) {
    return '";' + (ifElse ? '}else ' : '') + 'if(' + condition + '){retval+="';
  }
  function evalIfFirstOrLast() {
    return genEvalIf(this.ifElse, '$i' + (this.invert ? '!=' : '==') + (this.pos == 'first' ? '0' : '$l-1'));
  }
  function evalIfEmpty() {
    return genEvalIf(this.ifElse,
        '$t=' + this.sub.evaluate.apply(this.sub, arguments) + ','
      + (this.invert ? '!' : '')
      + '(jQuery.isArray($t)?$t.length===0:jQuery.isEmptyObject($t))'
    );
  }
  function evalIf() {
    return genEvalIf(this.ifElse, (this.invert ? '!' : '') + '(' + this.sub.evaluate.apply(this.sub, arguments) + ')');
  }
  function evalIfKeyOrValue() {
    return genEvalIf(this.ifElse,
        '$t=' + this.sub.evaluate.apply(this.sub, arguments) + ','
      + '$e=' + this.expr.evaluate.apply(this.expr, arguments) + ','
      + (this.invert ? '!' : '')
      + (this.ifKey
          ? 'jQuery.isArray($t)?$e>=0||$e<$t.length:jQuery.inArray($e,this.keys($t))!==-1'
          : 'jQuery.inArray($e,this.values($t))!==-1')
    );
  }
  function evalEach() {
    var result
      = '";$it=' + this.sub.evaluate.apply(this.sub, arguments) + ';'
      + '$t=this.proto(local);'
      + '(function($$,local){'
      + 'var $,$k,$keys,$i=0,'
      + '$l=jQuery.isArray($$)?$$.length:($keys=this.keys($$),$keys.length);'
      + 'while($i<$l){'
      + '$=(($k=$keys?$keys[$i]:$i),$$[$k]);';
    if (this.elem)  {result += 'local.' + this.elem + '=$;';}
    if (this.key)   {result += 'local.' + this.key + '=$k;';}
    if (this.index) {result += 'local.' + this.index + '=$i;';}
    return result + 'retval+="';
  }
  function evalTemplate() {
    var paramsLen = this.params.length
      , paramsStr = '';
    for (var i=0; i<paramsLen; i++) {
      var param = this.params[i];
      paramsStr += ',' + param.evaluate.apply(param, arguments);
    }
    return '"+this.byId("' + this.id + '"' + paramsStr + ')+"';
  }
  function evalObject() {
    var result = [];
    var object = this.object;
    for (var key in object) {
      if (object.hasOwnProperty(key)) {
        var property = object[key];
        result.push(key + ':' + property.evaluate.apply(property, arguments));
      }
    }
    return '{' + result.join(',') + '}';
  }
  function evalArray() {
    var result = [];
    var array = this.array;
    var length = array.length;
    for (var i=0; i<length; i++) {
      var element = array[i];
      result.push(element.evaluate.apply(element, arguments));
    }
    return '[' + result.join(',') + ']';
  }
  function evalExpression() {
    var op = this.operands[0]
      , result = op.evaluate.apply(op, arguments)
      , c = this.operators.length;
    for (var i=0; i<c; i++) {
      op = this.operands[i+1];
      result += this.operators[i] + op.evaluate.apply(op, arguments);
    }
    return result;
  }
  function evalFunction() {
    var args = [], argCount = this.args.length;
    for (var i=0; i<argCount; i++) {
      var arg = this.args[i];
      args.push(arg.evaluate.apply(arg, arguments));
    }
    return '(' + args.join(',') + ')';
  }

  function countLines(str) { return (str.match(/\n/g)||[]).length; }

  var listOfEvalIf = [evalIfFirstOrLast, evalIfEmpty, evalIf, evalIfKeyOrValue];
  function genFuncCode(template) {
    var result      = '', stmt
      , blockStack  = [], linesPassed = 0;
    while (stmt = searchTag(template)) {
      if (stmt.evaluate === evalEach) {
        blockStack.push(stmt.evaluate);
      }
      else if ($.inArray(stmt.evaluate, listOfEvalIf) !== -1) {
        if (stmt.ifElse && $.inArray(blockStack.pop(), listOfEvalIf) === -1) {
          throw new Error('Unexpected {else-if} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
        blockStack.push(stmt.evaluate);
      }
      else if (stmt.evaluate === evalCloseEach) {
        if (blockStack.pop() !== evalEach) {
          throw new Error('Unexpected {/each} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
      }
      else if (stmt.evaluate === evalCloseIf) {
        if ($.inArray(blockStack.pop(), listOfEvalIf) === -1) {
          throw new Error('Unexpected {/if} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
      }
      result      += escString(template.substr(0, stmt.start)) + stmt.evaluate();
      linesPassed += countLines(template.substr(0, stmt.end));
      template    = template.substr(stmt.end);
    }
    if (blockStack.length > 0) {
      throw new Error('No closing tag for ' + (blockStack.pop() === evalEach ? '{each}' : '{if}'));
    }

    result += escString(template);

    // $t, $e - temporary multipurpose variables
    return 'var local=data,$=local,$d=attrData,$it,$t,$e,retval="' + result + '"; return retval';
  }

  function escString(string) {
    return string
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r');
  }

  var errors    = [];
  var cache     = {};
  var cacheById = {};

  var plugin = function(template, data) {
    var code;
    try {
      if (template in cache === false) {
        code = genFuncCode(template);
        cache[template] = { func: new Function('data', 'attrData', code), code: code};
      }
      return cache[template].func.call(plugin, data);
    }
    catch (e) {
      var error = {
        template: template
        , code:     cache[template].code
        , data:     $.extend(true, {}, data)
        , error:    e.message
      };

      if (JSON && JSON.stringify) {
        error['data_json'] = JSON.stringify(data);
      }

      errors.push(error);

      throw e;
    }
  };

  plugin.byId = function(id, data) {
    try {
      var $templateEl = $('#'+id);
      if (id in cacheById === false) {
        if ($templateEl.length === 0) return false;
        var template = $templateEl.html(), code, func;

        if (template in cache) {
          code  = cache.code;
          func  = cache.func;
        } else {
          code  = genFuncCode(template);
          func  = new Function('data', 'attrData', code);
        }

        cache[template] = { func: func, code: code };
        cacheById[id]   = { func: func, code: code, template: template };
      }
      return cacheById[id].func.call($.tera, data, $templateEl.data());
    }
    catch (e) {
      var error = {
        template: cacheById[id] && cacheById[id].template
        , code:   cacheById[id] && cacheById[id].code
        , data:   $.extend(true, {}, data)
        , error:  e.message
      };

      if (JSON && JSON.stringify) {
        error['data_json'] = JSON.stringify(data);
      }

      errors.push(error);

      throw e;
    }
  };

  plugin.json = JSON && JSON.stringify || function() { throw new Error('JSON object is not provided') };

  // Получение собственных свойств объекта
  plugin.keys = Object.keys || (function () {
    'use strict';
    var hasOwnProperty = Object.prototype.hasOwnProperty,
      hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
      dontEnums = [
        'toString'
        , 'toLocaleString'
        , 'valueOf'
        , 'hasOwnProperty'
        , 'isPrototypeOf'
        , 'propertyIsEnumerable'
        , 'constructor'
      ],
      dontEnumsLength = dontEnums.length;

    return function (obj) {
      if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
        throw new TypeError('Object.keys called on non-object');
      }

      var result = [], prop, i;
      for (prop in obj) {
        if (hasOwnProperty.call(obj, prop)) {
          result.push(prop);
        }
      }
      if (hasDontEnumBug) {
        for (i = 0; i < dontEnumsLength; i++) {
          if (hasOwnProperty.call(obj, dontEnums[i])) {
            result.push(dontEnums[i]);
          }
        }
      }
      return result;
    };
  }());

  plugin.values = function(obj) {
    if ($.isArray(obj)) return obj;
    var values = [];
    for (var i=0, keys=this.keys(obj), len=keys.length; i<len; i++) {
      values.push(obj[keys[i]]);
    }
    return values;
  };

  // Экранирование специальных символов HTML
  plugin.escape = function(str) {
    return (''+str).replace(/[&<'"]/g, function(match) {
      switch(match[0])
      {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case "'": return '&#39;';
        case '"': return '&quot;';
      }
    });
  };

  plugin.proto = Object.create || function(source) {
    var constructor = function(){};
    constructor.prototype = source;
    return new constructor();
  };

  plugin.errors    = function() { return errors; };
  plugin.cache     = function() { return cache; };
  plugin.cacheById = function() { return cacheById; };

  plugin.lastError = function() {
    return errors[errors.length - 1];
  };

  plugin.clearCache = function() {
    cache = {};
    cacheById = {};
  };

  $.tera = plugin;

  $(function(){
    $('script[type="text/template-tera"]').each(function() {
      var id, template, code, func;

      try
      {
        id        = $(this).attr('id');
        template  = $(this).html();
        code      = genFuncCode(template);
        func      = new Function('data', 'attrData', code);

        cache[template] = { func: func, code: code };
        cacheById[id]   = { func: func, code: code, template: template };
      }
      catch (e)
      {
        errors.push({
          template: template
          , code:   code
          , error:  e.message
        });

        throw e;
      }
    });
  })
}) (jQuery);