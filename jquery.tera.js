/**
 * @name        Tera Templates
 * @description jQuery template plugin
 * @version     2.0.0
 * @author      Konstantin Krylov
 * @link        https://github.com/ssipak/tera/tree/2.0
 * @license     Public domain
 */
(function($) {
  var STATEMENTS = [
        generateMatchPrefix(/^else/,          evalElse),
        generateMatchPrefix(/^\/(if|unless)/, evalCloseIf),
        generateMatchPrefix(/^\/each/,        evalCloseEach),

        matchEach,          // {each [element[ as key][ at index] in ]array_or_hash}
        matchOpenCondition, // {[else-](if[-not]|unless)[-empty|-first|-last] [expr]}
        matchTemplate,      // {tmpl template_name}
        matchRawVariable,   // {raw var}
        matchEscVariable    // {var.key[var2.key2[var3]].key4}
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
      if (match !== null) return {start: startOffset, end: substringOffset + match[0].length, eval: evalNothing};
    }

    for (var stmtInd=0; stmtInd<STATEMENTS_COUNT; stmtInd++) {
      match = STATEMENTS[stmtInd](substring);
      if (match !== null) {
        match.start = startOffset;
        match.end   += substringOffset;
        return match;
      }
    }

    return {start: substringOffset, end: substringOffset, eval: evalNothing};
  }

  function matchTagEnd(string) {
    var match = /^(\s*(\*?)\})\s*/.exec(string);
    if (match === null) return null;
    return match[2] ? match[1].length : match[0].length;
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
      , end, expr;

    if (match[6]) { // {if-first} | {if-last}
      end = matchTagEnd(substring);
      if (end === null) return null;
      return {end: substringOffset + end, eval: evalIfFirstOrLast, invert: invert, ifElse: ifElse, pos: match[6]};
    }

    var spaces = skipSpaces(substring);
    if (spaces === 0) return null;
    substringOffset += spaces;
    substring = substring.substr(spaces);

    if (match[5] === 'empty') { // {if-empty array_or_object}
      expr = matchVariable(substring);
      if (expr === null) return null;
      end = matchTagEnd(substring.substr(expr.end));
      if (end === null) return null;
      return {end: substringOffset + expr.end + end, eval: evalIfEmpty, invert: invert, ifElse: ifElse, sub: expr};
    }

    expr = matchExpression(substring);
    if (expr === null) return null;

    if (!match[5]) { // {if expr}
      end = matchTagEnd(substring.substr(expr.end));
      if (end === null) return null;
      return {end: substringOffset + expr.end + end, eval: evalIf, invert: invert, ifElse: ifElse, sub: expr};
    }

    // {if-key key in array_or_object} | {if-val[ue] value in array_or_object}
    substringOffset += expr.end;
    substring = substring.substr(expr.end);
    var delimiter = substring.match(/^\s+in\s+/);
    if (delimiter === null) return null;
    delimiter = delimiter[0].length;
    substringOffset += delimiter;
    substring = substring.substr(delimiter);

    var sub = matchVariable(substring);
    if (sub === null) return null;
    end = matchTagEnd(substring.substr(sub.end));
    if (end === null) return null;
    return {end: substringOffset + sub.end + end, eval: evalIfKeyOrValue, invert: invert, ifElse: ifElse, ifKey: match[5]==='key', expr: expr, sub: sub};
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

    substringOffset += match.end;
    substring = substring.substr(match.end);
    var end = matchTagEnd(substring);
    if (end === null) return null;

    return {end: substringOffset + end, eval: evalEach, sub: match, elem: elem, key: key, index: index};
  }

  function generateMatchPrefix(prefixRegExp, eval)
  {
    return function(string) {
      var match = prefixRegExp.exec(string);
      if (match === null) return null;
      var end = matchTagEnd(string.substr(match[0].length));
      if (end === null) return null;
      return {end: match[0].length + end, eval: eval};
    };
  }

  function matchTemplate(string) {
    var match = /^tmpl ([\w-]+)/.exec(string);
    if (match === null) return null;
    var id = match[1]
      , params = []
      , offset = match[0].length
      , substring = string.substr(offset)
      , end;

    while (true) {
      end = matchTagEnd(substring);
      if (end !== null) {
        offset += end;
        break;
      }
      var spaces = skipSpaces(substring);
      offset += spaces;
      substring = substring.substr(spaces);
      match = matchExpression(substring);
      if (match === null) return null;

      params.push(match);
      offset += match.end;
      substring = substring.substr(match.end);
    }
    if (end === null) return null;
    return {end: offset, eval: evalTemplate, id: id, params: params};
  }

  function matchRawVariable(string) {
    if (string.substr(0,3) !== 'raw') return null;
    var spaces = skipSpaces(string.substr(3));
    if (spaces < 1) return null;

    var offset = 3 + spaces
      , variable = matchVariable(string.substr(offset));
    if (variable === null) return null;

    offset += variable.end;
    var end = matchTagEnd(string.substr(offset));
    if (end === null) return null;
    return {end: offset + end,  eval: evalRawVariableInsert, sub: variable};
  }

  function matchEscVariable(string) {
    var match = matchVariable(string);
    if (match === null) return null;

    var end = matchTagEnd(string.substr(match.end));
    if (end === null) return null;
    return {end: match.end + end, eval: evalEscVariableInsert, sub: match};
  }

  function matchExpression(string) {
    var match = matchGroup(string);
    if (match === null) return null;

    var substringOffset = match.end
      , substring = string.substr(substringOffset)
      , operands = [match]
      , operators = [];
    while (true) {
      var opOffset = skipSpaces(substring)
        , opMatch = matchOperator(substring.substr(opOffset));
      if (opMatch === null) break;

      opOffset += opMatch.end;
      opOffset += skipSpaces(substring.substr(opOffset));
      match = matchGroup(substring.substr(opOffset));
      if (match === null) break;

      opOffset += match.end;
      operators.push(opMatch.name);
      operands.push(match);

      substringOffset += opOffset;
      substring = substring.substr(opOffset);
    }
    return operands.length === 1
      ? match
      : {end: substringOffset, eval: evalExpression, operators: operators, operands: operands};
  }

  function matchOperator(string) {
    var match = /^([!=<>]=|<|>|&&|\|\||\+|\-)/.exec(string);
    return match === null ? null : {end: match[0].length, name: match[0]};
  }

  function matchGroup(string) {
    var match;
    if (string.substr(0, 1) === '(') {
      match = matchExpression(string.substr(1));
      if (match !== null) return null;
      if (string.substr(match.end + 1, 1) !== ')') return null;
      return {end: match.end + 2, eval: evalGroup, sub: match};
    }

    var funcs = [matchObject, matchVariable, matchString];
    for (var funcIndex in funcs) {
      match = funcs[funcIndex](string);
      if (match !== null) return match;
    }

    return matchNumber(string);
  }


  function matchFunction(string) {
    if (string.substr(0, 1) !== '(') return null;
    var args = []
      , substringOffset = 1
      , substring = string.substr(substringOffset);
    if (substring.substr(0, 1) === ')') return {end: substringOffset+1, eval: evalFunction, args: args};
    var match = matchExpression(substring);
    if (match === null) return null;
    args.push(match);
    substringOffset += match.end;
    substring = substring.substr(match.end);

    while (true) {
      var nextChar = substring.substr(0,1);
      if (nextChar === ')') break;
      if (nextChar !== ',') return null;
      var argOffset = 1;
      argOffset += skipSpaces(substring.substr(argOffset));
      match = matchExpression(substring.substr(argOffset));
      if (match === null) return null;
      args.push(match);
      argOffset += match.end;
      substringOffset += argOffset;
      substring = substring.substr(argOffset);
    }
    return {end: substringOffset+1, eval: evalFunction, args: args};
  }

  function matchString(string) {
    var match = /^'([^']*)'/.exec(string);
    if (match === null) return match;
    return {end: match[0].length, eval: evalString, string: match[1]};
  }

  function matchNumber(string) {
    var match = /^(-?)(\d+|0)(.\d+)?/.exec(string);
    if (match === null) return null;
    return {end: match[0].length, eval: evalNumber, number: match[0]};
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
        substringOffset += sub.end;
        substring = substring.substr(sub.end);
        continue;
      }
      sub = matchFunction(substring);
      if (sub !== null) {
        subs.push(sub);
        substringOffset += sub.end;
        substring = substring.substr(sub.end);
        continue;
      }
      match = /^\.((?=[^\d])\w+)/.exec(substring);
      if (match !== null) {
        subs.push({eval: evalSubvariable, name: match[1]});
        var end = match[0].length;
        substringOffset += end;
        substring = substring.substr(end);
        continue;
      }
      break;
    }

    return {end: substringOffset, eval: evalVariable, name: name, subs: subs};
  }

  function matchVariableComponent(string) {
    if (string.substr(0,1) !== '[') return null;
    var sub = matchExpression(string.substr(1));
    if (sub === null) return null;
    if (string.substr(1 + sub.end, 1) !== ']') return null;
    return {end: 2 + sub.end, eval: evalVariableComponent, sub: sub};
  }

  function matchObject(string) {
    if (string.substr(0,1) !== '{') return null;

    var offset = 1
      , substring = string.substr(1)
      , obj = {};
    while (true) {
      var keyMatch = /^\s*(\w+)\s*:\s*/.exec(substring);
      if (keyMatch === null) return null;
      var key = keyMatch[1]
        , end = keyMatch[0].length;
      offset += end;
      substring = substring.substr(end);
      var expr = matchExpression(substring);
      if (expr === null) return null;

      obj[key] = expr;
      offset += expr.end;
      substring = substring.substr(expr.end);
      var spaces = skipSpaces(substring);
      offset += spaces;
      substring = substring.substr(spaces);
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

    return {end: offset, eval: evalObject, object: obj}
  }

  function evalNothing()            { return ''; }
  function evalEscVariableInsert()  { return '"+this.escape(' + this.sub.eval.apply(this.sub, arguments) + ')+"'; }
  function evalRawVariableInsert()  { return '"+' + this.sub.eval.apply(this.sub, arguments) + '+"'; }
  function evalVariable()           {
    var result = (/^\$/.test(this.name) ? this.name : 'local.' + this.name)
      , subsCount = this.subs.length;
    for (var i=0; i<subsCount; i++) {
      var sub = this.subs[i];
      result += sub.eval.apply(sub, arguments);
    }
    return result;
  }
  function evalSubvariable()        { return '.' + this.name; }
  function evalVariableComponent()  { return '[' + this.sub.eval.apply(this.sub, arguments) + ']'; }
  function evalGroup()              { return '(' + this.sub.eval.apply(this.sub, arguments) + ')'; }
  function evalString()             { return "'" + this.string + "'"; }
  function evalNumber()             { return this.number; }

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
        '$t=' + this.sub.eval.apply(this.sub, arguments) + ','
      + (this.invert ? '!' : '')
      + '(jQuery.isArray($t)?$t.length===0:jQuery.isEmptyObject($t))'
    );
  }
  function evalIf() {
    return genEvalIf(this.ifElse, (this.invert ? '!' : '') + '(' + this.sub.eval.apply(this.sub, arguments) + ')');
  }
  function evalIfKeyOrValue() {
    return genEvalIf(this.ifElse,
        '$t=' + this.sub.eval.apply(this.sub, arguments) + ','
      + '$e=' + this.expr.eval.apply(this.expr, arguments) + ','
      + (this.invert ? '!' : '')
      + (this.ifKey
          ? 'jQuery.isArray($t)?$e>=0||$e<$t.length:jQuery.inArray($e,this.keys($t))!==-1'
          : 'jQuery.inArray($e,this.values($t))!==-1')
    );
  }
  function evalEach() {
    var result
      = '";$it=' + this.sub.eval.apply(this.sub, arguments) + ';'
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
      paramsStr += ',' + param.eval.apply(param, arguments);
    }
    return '"+this.byId("' + this.id + '"' + paramsStr + ')+"';
  }
  function evalObject() {
    var result = [];
    for (var key in this.object) {
      var property = this.object[key];
      result.push(key + ':' + property.eval.apply(property, arguments));
    }
    return '{' + result.join(',') + '}';
  }
  function evalExpression() {
    var op = this.operands[0]
      , result = op.eval.apply(op, arguments)
      , c = this.operators.length;
    for (var i=0; i<c; i++) {
      op = this.operands[i+1];
      result += this.operators[i] + op.eval.apply(op, arguments);
    }
    return result;
  }
  function evalFunction() {
    var args = [], argCount = this.args.length;
    for (var i=0; i<argCount; i++) {
      var arg = this.args[i];
      args.push(arg.eval.apply(arg, arguments));
    }
    return '(' + args.join(',') + ')';
  }

  function countLines(str) { return (str.match(/\n/g)||[]).length; }

  var listOfEvalIf = [evalIfFirstOrLast, evalIfEmpty, evalIf, evalIfKeyOrValue];
  function genFuncCode(template) {
    var result      = '', stmt
      , blockStack  = [], linesPassed = 0;
    while (stmt = searchTag(template)) {
      if (stmt.eval === evalEach) {
        blockStack.push(stmt.eval);
      }
      else if ($.inArray(stmt.eval, listOfEvalIf) !== -1) {
        if (stmt.ifElse && $.inArray(blockStack.pop(), listOfEvalIf) === -1) {
          throw new Error('Unexpected {else-if} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
        blockStack.push(stmt.eval);
      }
      else if (stmt.eval === evalCloseEach) {
        if (blockStack.pop() !== evalEach) {
          throw new Error('Unexpected {/each} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
      }
      else if (stmt.eval === evalCloseIf) {
        if ($.inArray(blockStack.pop(), listOfEvalIf) === -1) {
          throw new Error('Unexpected {/if} on line ' + (linesPassed + countLines(template.substr(0, stmt.start))));
        }
      }
      result      += escString(template.substr(0, stmt.start)) + stmt.eval();
      linesPassed += countLines(template.substr(0, stmt.end));
      template    = template.substr(stmt.end);
    }
    if (blockStack.length > 0) {
      throw new Error('No closing tag for ' + (blockStack.pop() === evalEach ? '{each}' : '{if}'));
    }

    result += escString(template);

    // $t, $e - temporary multipurpose variables
    return 'var local=data,$=local,$d=attrData,$it,$t,$e,retval="' + result + '"; return retval';
  };

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
  }

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

  plugin.proto = function(source) {
    var constructor = function(){};
    constructor.prototype = source;
    return new constructor();
  }

  plugin.errors    = function() { return errors; };
  plugin.cache     = function() { return cache; };
  plugin.cacheById = function() { return cacheById; };

  plugin.lastError = function() {
    return errors[errors.length - 1];
  }

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