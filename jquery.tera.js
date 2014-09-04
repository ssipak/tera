// Tera Templates (Konstantin Krylov)
(function($) {
  // Ищем выражение
  function searchTag(string) {
    var start = /(\s*)\{(\*?)/.exec(string);
    // Выражения не найдены
    if (start === null) {
       return null;
    }

    var substringOffset = start.index + start[0].length
      , substring       = string.substr(substringOffset)
      , startOffset     = (start[2] ? 0 : start[1].length) + start.index
      , match;

    // Выражение {*} ?
    if (start[2]) {
      match = /^\}\s+/.exec(substring);
      if (match !== null) {
        return {start: startOffset, end: substringOffset + match[0].length, eval: evalNothing};
      }
    }

    // {each [element[ as key][ at index] in ]array_or_hash}
    match = matchEach(substring);
    if (match !== null) {
      return $.extend(match, {start: startOffset, end: substringOffset + match.end});
    }

    // {[else-](if[-not]|unless)[-empty|-first|-last] [expr]}
    match = matchOpenCondition(substring);
    if (match !== null) {
      return $.extend(match, {start: startOffset, end: substringOffset + match.end});
    }

    // {tmpl template_name}
    match = matchTemplate(substring);
    if (match !== null) {
      return $.extend(match, {start: startOffset, end: substringOffset + match.end});
    }

    // {else}
    if (substring.substr(0,4) === 'else') {
      end = matchTagEnd(substring.substr('else'.length));
      if (end !== null) {
        return {start: startOffset, end: substringOffset + 4 + end, eval: evalElse};
      }
    }

    // {/(if|unless)}
    match = /^\/(if|unless)/.exec(substring);
    if (match !== null) {
      end = matchTagEnd(substring.substr(match[0].length));
      if (end !== null) {
        return {start: startOffset, end: substringOffset + match[0].length + end, eval: evalCloseIf};
      }
    }

    // {/each}
    if (substring.substr(0,5) === '/each') {
      end = matchTagEnd(substring.substr('/each'.length));
      if (end !== null) {
        return {start: startOffset, end: substringOffset + '/each'.length + end, eval: evalCloseEach};
      }
    }

    // {var.key[var2.key2[var3]].key4}
    match = matchVariable(substring);
    if (match !== null) {
      end = matchTagEnd(substring.substr(match.end));
      if (end !== null) {
        return {start: startOffset, end: substringOffset + match.end + end, eval: evalVariableWrapper, sub: match};
      }
    }

    return {start: substringOffset, end: substringOffset, eval: evalNothing};
  }

  function matchTagEnd(string) {
    var match = /^(\s*(\*?)\})\s*/.exec(string);
    if (match === null) {
      return null;
    }
    return match[2] ? match[1].length : match[0].length;
  }

  function skipSpaces(string) {
    return /^\s*/.exec(string)[0].length;
  }

  function matchOpenCondition(string) {
    //            1       2  3              4 5      6
    var match = /^(else-)?(if(-not)?|unless)(-(empty|(first|last)))?/.exec(string);
    if (match === null) {
      return null;
    }

    var substringOffset = match[0].length
      , substring = string.substr(substringOffset)
      , ifElse = match[1]
      , invert = match[2] === 'if-not' || match[2] === 'unless'
      , end, expr;

    if (match[6])
    {
      end = matchTagEnd(substring);
      if (end === null) {
        return null;
      }
      return {end: substringOffset + end, eval: evalIfFirstOrLast, invert: invert, ifElse: ifElse, pos: match[6]};
    }

    var spaces = skipSpaces(substring);
    if (spaces === 0) {
      return null;
    }

    substringOffset += spaces;
    substring = substring.substr(spaces);

    if (match[5] === 'empty')
    {
      expr = matchVariable(substring);
      if (expr === null) {
        return null;
      }
      end = matchTagEnd(substring.substr(expr.end));
      if (end === null) {
        return null;
      }
      return {end: substringOffset + expr.end + end, eval: evalIfEmpty, invert: invert, ifElse: ifElse, sub: expr};
    }

    expr = matchExpression(substring);
    if (expr === null) {
      return null;
    }
    end = matchTagEnd(substring.substr(expr.end));
    if (end === null) {
      return null;
    }
    return {end: substringOffset + expr.end + end, eval: evalIf, invert: invert, ifElse: ifElse, sub: expr};
  }

  function matchEach(string) {
    //                1   2          3        4            5        6
    var match = /^each(\s+((?!\d)\w+)(\s+as\s+((?!\d)\w+))?(\s+at\s+((?!\d)\w+))? in)?/.exec(string);
    if (match === null) {
      return null;
    }
    var elem = match[2]
      , key = match[4]
      , index = match[6]
      , substringOffset = match[0].length
      , substring = string.substr(substringOffset)
      , spaces = skipSpaces(substring);
    if (spaces === 0) {
      return null;
    }
    substringOffset += spaces;
    substring = substring.substr(spaces);
    match = matchVariable(substring);
    if (match === null) {
      return null;
    }
    substringOffset += match.end;
    substring = substring.substr(match.end);
    end = matchTagEnd(substring);
    if (end === null) {
      return null;
    }
    return {end: substringOffset + end, eval: evalEach, sub: match, elem: elem, key: key, index: index};
  }

  function matchTemplate(string) {
    var match = /^tmpl ([\w-]+)/.exec(string);
    if (match === null) {
      return null;
    }
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
      if (match === null) {
        return null;
      }
      params.push(match);
      offset += match.end;
      substring = substring.substr(match.end);
    }
    if (end === null) {
      return null;
    }
    return {end: offset, eval: evalTemplate, id: id, params: params};
  }

  function matchExpression(string) {
    var match = matchGroup(string);
    if (match === null) {
      return null;
    }

    var substringOffset = match.end
      , substring = string.substr(substringOffset);

    var operands = [match], operators = [];

    while (true) {
      var opOffset = skipSpaces(substring)
        , opMatch = matchOperator(substring.substr(opOffset));
      if (opMatch === null) {
        break;
      }

      opOffset += opMatch.end;
      opOffset += skipSpaces(substring.substr(opOffset));
      match = matchGroup(substring.substr(opOffset));
      if (match === null) {
        break;
      }
      opOffset += match.end;

      operators.push(opMatch.name);
      operands.push(match);

      substringOffset += opOffset;
      substring = substring.substr(opOffset);
    }

    return {end: substringOffset, eval: evalExpression, operators: operators, operands: operands};
  }

  function matchOperator(string) {
    var match = /^([!=><]=|&&|\|\||\+|\-)/.exec(string);
    return match === null ? null : {end: match[0].length, name: match[0]};
  }

  function matchGroup(string) {
    var match;
    if (string.substr(0, 1) === '(') {
      match = matchExpression(string.substr(1));
      if (match !== null) {
        return null;
      }
      if (string.substr(match.end + 1, 1) !== ')') {
        return null;
      }
      return {end: match.end + 2, eval: evalGroup, sub: match};
    }

    var funcs = [matchObject, matchFunction, matchVariable, matchString];
    for (var funcIndex in funcs) {
      match = funcs[funcIndex](string);
      if (match !== null) {
        return match;
      }
    }

    return matchNumber(string);
  }

  function matchFunction(string) {
    var match = /^(\w+)\(/.exec(string);
    if (match === null) {
      return null;
    }
    var name = match[1]
      , args = []
      , substringOffset = match[0].length
      , substring = string.substr(substringOffset);
    if (substring.substr(0, 1) === ')')
    {
      return {end: substringOffset+1, name: name, args: args};
    }
    match = matchExpression(substring);
    if (match === null) {
      return null;
    }
    args.push(match);
    substringOffset += match.end;
    substring = substring.substr(match.end);

    while (true) {
      var nextChar = substring.substr(0,1);
      if (nextChar === ')') {
        break;
      }
      if (nextChar !== ',') {
        return null;
      }
      var argOffset = 1;
      argOffset += skipSpaces(substring.substr(argOffset));
      match = matchExpression(substring.substr(argOffset));
      if (match === null) {
        return null;
      }
      argOffset += match.end;
      substringOffset += argOffset;
      substring = substring.substr(argOffset);
    }
    return {end: substringOffset+1, eval: evalFunction, name: name, args: args};
  }

  function matchString(string) {
    var match = /^'([^']*)'/.exec(string);
    if (match === null) {
      return match;
    }
    return {end: match[0].length, eval: evalString, string: match[1]};
  }

  function matchNumber(string) {
    var match = /^(-?)(\d+|0)(.\d+)?/.exec(string);
    if (match === null) {
      return null;
    }
    return {end: match[0].length, eval: evalNumber, number: match[0]};
  }

  function matchVariable(string) {
    var match = /^(\$(keys|[$ikld]|)|(?!\d)\w+)/.exec(string);
    if (match === null) {
      return null;
    }

    var substringOffset = match[0].length
      , name = match[1]
      , sub = matchSubvariable(string.substr(substringOffset));

    if (sub !== null) {
      return {end: substringOffset + sub.end, eval: evalVariable, name: name, sub: sub};
    }

    return {end: substringOffset, eval: evalVariable, name: name}
  }

  function matchSubvariable(string) {
    var match = /^\.((?=[^\d])\w+)/.exec(string);
    if (match === null) {
      return matchVariableComponent(string);
    }

    var substringOffset = match[0].length
      , name = match[1]
      , sub = matchSubvariable(string.substr(substringOffset));

    if (sub !== null) {
      return {end: substringOffset + sub.end, eval: evalSubvariable, name: name, sub: sub};
    }

    return {end: substringOffset, eval: evalSubvariable, name: name};
  }

  function matchVariableComponent(string) {
    if (string.substr(0,1) !== '[') {
      return null;
    }

    var inner = matchVariable(string.substr(1));
    if (inner === null) {
      return null;
    }
    if (string.substr(1 + inner.end, 1) !== ']') {
      return null;
    }
    var substringOffset = 2 + inner.end
      , sub = matchSubvariable(string.substr(substringOffset));

    if (sub !== null) {
      return {end: substringOffset + sub.end, eval: evalVariableComponent, inner: inner, sub: sub};
    }

    return {end: substringOffset, eval: evalVariableComponent, inner: inner};
  }

  function matchObject(string) {
    if (string.substr(0,1) !== '{') {
      return null;
    }
    var offset = 1
      , substring = string.substr(1)
      , obj = {};
    while (true) {
      var keyMatch = /^\s+(\w+)\s+:\s+/.exec();
      if (keyMatch === null) {
        return null;
      }
      var key = keyMatch[1]
        , end = keyMatch[0].length;
      offset += end;
      substring = substring.substr(end);
      var expr = matchExpression(substring);
      if (expr === null) {
        return null;
      }
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
      if (nextChar !== ',') {
        return null;
      }
      offset += 1;
      substring = substring.substr(1);
    }

    return {end: offset, eval: evalObject, object: obj}
  }

  function evalNothing()            { return ''; }
  function evalVariableWrapper()    { return '" + ' + this.sub.eval.apply(this.sub, arguments) + ' + "'; }
  function evalVariable()           { return (/^\$/.test(this.name) ? this.name : 'local.' + this.name) + ('sub' in this ? this.sub.eval.apply(this.sub, arguments) : ''); }
  function evalSubvariable()        { return '.' + this.name + ('sub' in this ? this.sub.eval.apply(this.sub, arguments) : ''); }
  function evalVariableComponent()  { return '[' + this.inner.eval.apply(this.inner, arguments) + ']' + ('sub' in this ? this.sub.eval.apply(this.sub, arguments) : ''); }
  function evalGroup()              { return '(' + this.sub.eval.apply(this.sub, arguments) + ')'; }
  function evalString()             { return "'" + this.string + "'"; }
  function evalNumber()             { return this.number; }

  function evalElse()               { return '";}else{retval+="'; }
  function evalCloseIf()            { return '"}retval+="'; }
  function evalCloseEach()          { return '";$i++}}).call(this,$it);retval+="'; }

  function evalIfFirstOrLast() {
    return '";' + (this.ifElse ? '}else ' : '')
      + 'if($i' + (this.invert ? '!=' : '==')
      + (this.pos == 'first' ? '0' : '$l-1')
      + '){retval+="';
  }
  function evalIfEmpty() {
    return '";' + (this.ifElse ? '}else ' : '')
      + 'if($t=' + this.sub.eval.apply(this.sub, arguments) + ','
      + (this.invert ? '!' : '')+'('
      + 'jQuery.isArray($t)&&$t.length===0||jQuery.isEmptyObject($t)'
      + ')){retval+="';
  }
  function evalIf() {
    return '";' + (this.ifElse ? '}else ' : '')
      + 'if(' + (this.invert ? '!' : '')
      + '(' + this.sub.eval.apply(this.sub, arguments)
      + ')){retval+="';
  }
  function evalEach() {
    var result
      = '";$it=' + this.sub.eval.apply(this.sub, arguments) + ';(function($$){'
      + 'var $,$k,$keys,'
      + '$i=0,$l=jQuery.isArray($$)?$$.length:($keys=this.keys($$),$keys.length);'
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
      paramsStr += ',' + this.params[i].eval();
    }
    return '"+jQuery.tera.byId("'+this.id+'"'+paramsStr+')+"';
  }
  function evalObject() {
    var result = [];
    for (var key in this.object) {
      result.push(key + ':' + this.object[key].eval());
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
    var args = '', argCount = this.args.length;
    if (argCount > 0) {
      args += this.args[0].eval.apply(this.args[0], arguments);
      for (var i=1; i<argCount; i++) {
        args += ',' + this.args[i].eval.apply(this.args[i], arguments);
      }
    }
    return this.name + '(' + args + ')';
  }

  function gen_func_code(template) {
    var result = '', expr;
    while (expr = searchTag(template))
    {
      result += escString(template.substr(0, expr.start)) + expr.eval();
      template = template.substr(expr.end);
    }
    result += escString(template);

    return ''
            // Копируем данные в новый объект или массив,
            // чтобы не затереть данные при определнии переменных в шаблоне
            + 'var local=(typeof data==="object")'
              + '?jQuery.extend(jQuery.isArray(data)?[]:{},data)'
              + ':data,'
            + '$=local,$d=attrData,$it,$t,retval="'
            + result
            + '"; return retval';
  };

  function escString(string) {
    return string
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r');
  }

  var cache     = {};
  var cacheById = {};
  var errors    = [];

  $.tera = function(template, data) {
    var code;
    try {
      if (template in cache === false)
      {
        code = gen_func_code(template);
        cache[template] = { func: new Function('data', 'attrData', code), code: code};
      }
      return cache[template].func.call($.tera, data);
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

  $.tera.byId = function(id, data) {
    try {
      var $templateEl = $('#'+id);
      if (id in cacheById === false)
      {
        if ($templateEl.length === 0)
        {
          return false;
        }
        var template = $templateEl.html(), code, func;

        if (template in cache)
        {
          code  = cache.code;
          func  = cache.func;
        }
        else
        {
          code  = gen_func_code(template);
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

  $.tera.json = JSON && JSON.stringify || function() { throw new Error('JSON object is not provided') };

  $.tera.errors = function() { return errors; };

  $.tera.lastError = function() {
    return errors[errors.length - 1];
  }

  // Получение собственных свойств объекта
  $.tera.keys = Object.keys || (function () {
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

  // Экранирование специальных символов HTML
  $.tera.escape = function(str) {
    return str.replace(/[&<'"]/g, function(match) {
      switch(match[0])
      {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case "'": return '&#39;';
        case '"': return '&quot;';
      }
    });
  };

  $.tera.clearCache = function() {
    cache = {};
    cacheById = {};
  };

  $(function(){
    $('script[type="text/template-tera"]').each(function() {
      var id, template, code, func;

      try
      {
        id        = $(this).attr('id');
        template  = $(this).html();
        code      = gen_func_code(template);
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
})(jQuery);