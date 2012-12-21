// Tera Templates (Konstantin Krylov)
(function($){
  var cache     = {};
  var cacheById = {};
  var debug     = [];

  // ()x0
  var keyname_re_part = '[$][ki]';

  // ()x0
  var varname_re_part = '(?:\\w+|[$]{1,2})(?:[.]\\w+)*';

  // ()x0
  var complex_varname_re_part = varname_re_part + '(?:[.]\\w+|\\['+varname_re_part+'\\])*';

  // ()x0
  var digital_re_part = '[+-]?\\d+(?:[.]\\d+)*';

  var string_re_part = "'[^'\\\\]*'";

  //                     1
  var operand_re_part = '(' + [
    complex_varname_re_part,
    keyname_re_part,
    digital_re_part,
    string_re_part
  ].join('|')+')';

  //                               1                 2          3
  var func_operand_re_part = '(?:'+operand_re_part+'|(\\w+)[(]'+operand_re_part+'[)])';

  var keyname_re = new RegExp('^'+keyname_re_part+'$', 'g');

  //                                   1
  var varorkeyname_re = new RegExp('[{]('+keyname_re_part+'|'+complex_varname_re_part+')[}]', 'g');

  var if_re = new RegExp(
  //      1       2
      '[{](else-)?(if|if-not|unless)\\s+'
  //    3 4 5
      + func_operand_re_part
  //            6                   7 8 9
      + '(?:\\s*([<>]=?|[!=]=)\\s*'+func_operand_re_part+')?'
      + '[}]',
    'gi');

  //                         1      2       3     4      5         6   7     8      9
  var if_sub = function(str, elsec, constr, var1, func1, funcvar1, op, var2, func2, funcvar2) {
    var retval = '";'+(elsec ? '}else ' : '')
               + 'if('+(constr==='unless'||constr==='if-not'?'!':'')+'('
               + (var1 ? var_or_lit_conv(var1) : func_var_or_lit_conv(func1, funcvar1));
    if (op)
    {
      retval += ' '+op+' ';
      retval += var2 ? var_or_lit_conv(var2) : func_var_or_lit_conv(func2, funcvar2);
    }
    return retval+')){retval+="';
  }

  //                                 1                2
  var if_empty_re = new RegExp('[{]if(-not)?-empty\\s+('+complex_varname_re_part+')[}]', 'gi');

  var each_re = new RegExp(
    //          12     3          4       5          6                   7
    '[{]each\\s+((\\w+)(\\s+as\\s+(\\w+))?(\\s+at\\s+(\\w+))?\\s+in\\s+)?('+complex_varname_re_part+')[}]', 'gi'
  );

  //                                    1
  var escape_re = new RegExp('[{]esc\\s+(' + keyname_re_part + '|' + complex_varname_re_part + ')' + '[}]', 'gi');

  var var_conv = function (token) {
    //(/^[$]{1,2}/.test(token)?'':'local')+
    return  keyname_re.test(token)
            ? token
            : token.replace(/[.]?(\w+)/g, '["$1"]').replace(/^\[|(\[)\[/g, '$1local[');
  }

  var literal_re = new RegExp('^('+[digital_re_part, string_re_part].join('|')+')$', 'gi');

  var var_or_lit_conv = function(token) {
    return  literal_re.test(token)
            ? token
            : var_conv(token);
  };
  var func_var_or_lit_conv = function(func, token) {
    switch (func)
    {
      case 'num':
        return 'Number(' + var_or_lit_conv(token) + ')'; break;

      default: throw new Error("Unsupported function "+func);
    }
  };

  var gen_func_text = function(template) {
    return 'function(data){'
            // Копируем данные в новый объект или массив,
            // чтобы не затереть данные при определнии переменных в шаблоне
            + 'var local=(typeof data==="object")?jQuery.extend(jQuery.isArray(data)?[]:{},data):data;'
            + 'var $=local;'
            + 'var retval="'
            + template
              // escapes quotes and backslash
              .replace(/\\/g, '\\\\').replace(/"/g,  '\\"')
              // {each val as key in key.array}
              .replace(each_re, function(str, a1, val, a3, key, a5, ind, arr) {
                var retval = '";(function(){var $$='+var_conv(arr)+';var $i=0;jQuery.each($$,function($k,$){';
                if (val) {retval += 'local["'+val+'"]=$;';}
                if (key) {retval += 'local["'+key+'"]=$k;';}
                if (ind) {retval += 'local["'+ind+'"]=$i;';}
                retval += 'retval+="';
                return retval;
              })
              // {/each}
              .replace(/[{][/]each[}]/gi, '";$$i++;});})();retval+="')
              // {if[-not]|unless key.subkey[ op key.subkey]}
              .replace(if_re, if_sub)
              // {if-empty key.array}
              .replace(if_empty_re, function(str, not, arr) {
                var converted_var = var_conv(arr);
                return '";if('+(not?'!':'')+'('
                    +'jQuery.isArray('+converted_var+')&&'+converted_var+'.length===0||jQuery.isEmptyObject('+converted_var+')'
                  +')){retval+="';
              })
              // {if-first}, {if-last}, {unless-first}, {unless-last}, {if-not-first}, {if-not-last}
              .replace(/[{](?:if(-not)?|(unless))-(first|last)[}]/gi, function (str, not, unless, forl) {
                return '";if($i'
                  + (not || unless ? '!=' : '==')
                  + (forl == 'first' ? '0' : '$$.length-1')
                  + '){retval+="';
              })
              // {/if|unless}
              .replace(/[{][/](if|unless)[}]/gi, '";}retval+="')
              // {else}
              .replace(/[{]else[}]/gi, '";}else{retval+="')
              // {escape var}
              .replace(escape_re, function(str, varname) {
                return '"+jQuery.tera.escape('+var_conv(varname)+')+"'
              })
              // {var[.key[.subkey]]}
              .replace(varorkeyname_re, function(str, varname) {
                return '"+'+var_conv(varname)+'+"';
              })
              // "{", "}"
              .replace(/[{]([{}])[}]/g, '$1')
              // {*} - means that space being around shall be erased
              .replace(/\s*[{]([*])[}]\s*/g, '')
              // Tabs, new lines etc.
              .replace(/\n/g, '\\n')
              .replace(/\t/g, '\\t')
              .replace(/\r/g, '\\r')
            + '"; return retval;}';
  };

  var eval_func = function(func_text) {
    var func;
    eval('func='+func_text);
    return func;
  };

  $.tera = function(template, data) {
    if (template in cache === false)
    {
      var func_text = gen_func_text(template);
      debug.push({
        template: template,
        func_text: func_text
      });
      cache[template] = eval_func(func_text);
    }
    return cache[template](data);
  };

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

  $.tera.debug = function() {
    return debug;
  };

  $.tera.clearCache = function() {
    cache = {};
    cacheById = {};
    debug = [];
  };

  $.tera.byId = function(id, data) {
    if (id in cacheById === false)
    {
      var $templateEl = $('#'+id);
      if ($templateEl.length === 0)
      {
        return false;
      }
      var template  = $templateEl.html();
      var func_text = gen_func_text(template);
      debug.push({
        template: template,
        func_text: func_text
      });
      var func = eval_func(func_text);

      cache[template] = func;
      cacheById[id]   = func;
    }
    return cacheById[id](data);
  };

  $(function(){
    $('script[type="text/template-tera"]').each(function() {
      var id          = $(this).attr('id');
      var template    = $(this).html();
      var func_text   = gen_func_text(template);
      var func        = eval_func(func_text);
      debug.push({
        template:   template,
        func_text:  func_text
      });
      cache[template] = func;
      cacheById[id]   = func;
    });
  })

})(jQuery);
