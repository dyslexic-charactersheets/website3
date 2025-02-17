#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from "crypto";

import fse from 'fs-extra';
import colors from 'colors';
import Handlebars from 'handlebars';
import HandlebarsHelpers from 'handlebars-helpers';
import { parse } from 'node-html-parser';
import Sass from 'sass';

import { loadReady, getPageData } from './gamedata.js';
import { languages, languageNames, translate, de_i18n } from './i18n.js';
import { getNews } from './news.js'
// import { getQuotes } from './quotes.js'
import { slugify, isString, stringify, isObject, toKebabCase, toCamelCase, log, warn, error } from './util.js';
import { translateObject } from './i18n.js';

Error.stackTraceLimit = Infinity;
let hasError = false;

// init handlebars
const helpers = HandlebarsHelpers({
    handlebars: Handlebars
});


// General helpers

Handlebars.registerHelper('slug', function (str, obj) {
  if (!isString(str)) {
    // error("slug", "Slugify:".red, str, obj);
    return '';
  }
  return slugify(str);
});

Handlebars.registerHelper('kebabCase', function (str, obj) {
  if (!isString(str)) {
    // error("slug", "Kebab case:".red, str, obj);
    return '';
  }
  str = str.replaceAll('/', '-');
  return toKebabCase(str);
});

Handlebars.registerHelper('camelCase', function (str, obj) {
  if (!isString(str)) {
    // error("slug", "Camel case:".red, str, obj);
    return '';
  }
  str = str.replaceAll('/', '-');
  return toCamelCase(str);
});

Handlebars.registerHelper('dump', function (obj) {
  return "<!-- "+JSON.stringify(obj, null, 2)+" -->";
});

Handlebars.registerHelper('ifeq', function (term1, term2, thenValue, elseValue) {
  if (term1 == term2) {
    return thenValue;
  } else {
    return elseValue;
  }
});

Handlebars.registerHelper('plus', function (term1, term2) {
  return parseInt(term1) + parseInt(term2);
});

Handlebars.registerHelper('when', function (operand_1, operator, operand_2, options) {
  let operators = {
   'eq': function(l,r) { return l == r; },
   'noteq': function(l,r) { return l != r; },
   'gt': function(l,r) { return Number(l) > Number(r); },
   'lt': function(l,r) { return Number(l) < Number(r); },
   'gte': function(l,r) { return Number(l) >= Number(r); },
   'lte': function(l,r) { return Number(l) <= Number(r); },
   'or': function(l,r) { return l || r; },
   'and': function(l,r) { return l && r; },
   '%': function(l,r) { return (l % r) === 0; }
  }
  let result = operators[operator](operand_1,operand_2);

  if (result) return options.fn(this);
  else  return options.inverse(this);
});

Handlebars.registerHelper('nextSelect', function (next) {
  if (!Array.isArray(next)) {
    return "";
  }
  for (let subselect of next) {
    if (!subselect.hasOwnProperty('values') || subselect.values.length == 0) continue;
    if (subselect.max > 1) continue;
    return subselect.select;
  }
  return "";
});

Handlebars.registerHelper('default', function (value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return value;
});

Handlebars.registerHelper('json', function (data) {
  return JSON.stringify(data);
});

Handlebars.registerHelper('dataAttributes', function (data) {
  if (data === undefined || data === null) {
    return '';
  }

  let attrs = [];
  for (let key of Object.keys(data)) {
    attrs.push(`data-${key}="${data[key]}"`);
  }
  return attrs.join(" ");
});

Handlebars.registerHelper('isDark', function (bg) {
  switch(bg) {
    case 'blue':
    case 'red':
    case 'starfield':
    case 'scifi':
      return true;
    default:
      return false;
  }
});

Handlebars.registerHelper('times', function (n, block) {
  let accum = '';
  for(let i = 0; i < n; ++i)
      accum += block.fn({
        i: i+1
      });
  return accum;
});

Handlebars.registerHelper('array', function (...items) {
  items.pop();
  return [...items]
});

Handlebars.registerHelper('item', function (options) {
  return options.hash;
});

Handlebars.registerHelper('range', function (from, to) {
  let array = [];
  for (let i = from; i < to; i++) {
    array.push(i);
  }
  return array;
});

Handlebars.registerHelper('de_i18n', function (content) {
  return de_i18n(content);
});


// Load components
let components = [];
function loadComponents(dir) {
  for (let file of fs.readdirSync(dir)) {
    let filepath = dir+'/'+file;

    if (fs.lstatSync(filepath).isDirectory()) {
      loadComponents(filepath);
    } else if (file.match(/\.html$/)) {
      let content = fs.readFileSync(filepath, { encoding: 'utf8' });
      let name = file.replace(/\.html$/, '');
      // log("components", "Component loaded:".green, name);
      // fs.writeFile('../debug/components/'+name+'.html', content, 'utf-8', (err) => {});

      try {
        function getContentParts(rex) {
          let matches = content.matchAll(rex);
          let parts = [];
          for (let match of matches) {
            parts.push(match[1].trim());
          }
          return parts.join("\n");
        }

        let template = getContentParts(/<template>((.|[\r\n])*?)<\/template>/g);
        let js = getContentParts(/<script>((.|[\r\n])*?)<\/script>/g);
        let scss = getContentParts(/<style>((.|[\r\n])*?)<\/style>/g);

        // Handlebars.registerPartial(name, template);

        ((name, template) => {
          let partial = Handlebars.compile(template);
          Handlebars.registerPartial(name, function (...args) {
            // console.log("partial", "Partial", name, ...args);
            try {
              let stack = [];
              if (Array.isArray(args[1].data.currentComponent)) {
                stack = args[1].data.currentComponent;
              }
              let data = {
                ...args[1].data,
                currentComponent: [...stack, name]
              };
              args[1].data = data;
              return partial(...args);
            } catch (x) {
              error(name, "Error", x);
              return "";
            }
          });
        })(name, template);

        // fs.writeFile('../debug/components/'+name+'-template.html', template, 'utf-8', (err) => {});
        // fs.writeFile('../debug/components/'+name+'-js.html', js, 'utf-8', (err) => {});
        // fs.writeFile('../debug/components/'+name+'-scss.html', scss, 'utf-8', (err) => {});

        components.push({
          name,
          js,
          scss
        });
      } catch (e) {
        error("make", "Error parsing component:".red, file, e);
        hasError = true;
      }
    }
  }
}
loadComponents('components');

Handlebars.registerHelper('__', function (content, ...attribs) {
  if (content === null || content === undefined) {
    let context = [];
    if (attribs.length > 0 && isString(attribs[0])) {
      context.push(attribs.shift());
    }
    error("__", "Cannot translate nothing".red, ...context,
      attribs[0].data.root.page, attribs[0].data.root.lang,
      attribs[0].data.currentComponent, 
      attribs[0].loc
      // attribs[0]
    );
    return "";
    // throw new Error("Cannot translate nothing"+JSON.stringify(attribs[0].loc));
  }

  // find the current language
  let options = attribs[attribs.length - 1];
  let lang = options.data.root.lang;

  return translate(content, lang, attribs);
});

Handlebars.registerHelper('translateCollapse', function (object, ...attribs) {
  let lang = attribs[0].data.root.lang;
  return translateObject(object, lang);
});

Handlebars.registerHelper('languagename', function (lang) {
  return languageNames[lang];
});

Handlebars.registerHelper('link', function (lang, page, options) {
  if (page === undefined || page === null) {
    error("link", "Error in link".red, options.data['partial-block'](), options);
    return '';
  }

  if (page.match(/^http/)) {
      return page;
  }

  let query = '';
  let parts = page.match(/(.*)\?(.*)/);
  if (parts) {
    page = parts[1];
    query = '?'+parts[2];
  }

  if (page == "index") {
      return '/'+lang+'/'+query;
  } else {
      return '/'+lang+'/'+page+'.html'+query;
  }
});

Handlebars.registerHelper('autop', function (content) {
    if (content === undefined || content === null) {
        error("autop", "No content".red);
        hasError = true;
        return "";
    }
    let lines = content.split(/\n/);
    lines = lines.map((line) => line.trim());
    lines = lines.filter((line) => line != "");
    lines = lines.map((line) => "<p>"+line+"</p>");
    return lines.join("\n");
});

Handlebars.registerHelper('str', function (template, options) {
  if (template === undefined || template === null || template == "" || !(typeof template === 'string' || template instanceof String)) {
    error("str", "Cannot interpolate string:".red, template, "\n   Options", options);
    hasError = true;
    return "";
  }
  if (options === undefined || options === null || !(options instanceof Object)) {
    warn("str", "Supplanting options", options);
    options = {};
  }

  let str = template.replaceAll(/\$\{(.*?)\}/g, function (match, variable) {
    if (variable in options.hash) {
      return options.hash[variable];
    } else if (variable in options.data) {
      return options.data[variable];
    } else if (variable in options.data._parent) {
      return options.data._parent[variable];
    } else if (variable in options.data.root) {
      return options.data.root[variable];
    } else {
      return '';
    }
  });
  
  return str;
});


// Register partials
let partials = fs.readdirSync('partials');
for (let partial of partials) {
    let name = partial.replace(/\.html\.hbs$/, '');
    warn("partial", "Partial loaded:".green, name);
    let partialBody = fs.readFileSync('partials/'+partial, { encoding: 'utf8' });
    Handlebars.registerPartial(name, partialBody);
}

    
// Build the stylesheet
log("make", "Compiling stylesheet");
let stylesheet = Sass.compile('scss/stylesheet.scss');

let scssComponents = components.map((component) => {
  try {
    let compiled = Sass.compileString(component.scss, {
      loadPaths: ['scss']
    });
    return compiled.css;
  } catch (e) {
    error("make", "Error compiling SCSS for component".red, component.name, e);
    hasError = true;
    return '';
  }
});

let stylesheetParts = [stylesheet.css, ...scssComponents];
stylesheet = Sass.compileString(stylesheetParts.join('\n'));

fs.writeFile('../dist/htdocs/style.css', stylesheet.css, (err) => {
  if (err) {
    error("make", "Stylesheet ERROR ".red+err);
    hasError = true;
  } else {
    log("make", "Stylesheet OK".green);
  }
});

// Build the script
log("make", "Compiling script");
let scripts = [
    'debug',
    'util',
    'script',
    'components',
    'bind',
    'signals',
    'build',
    'build-classic',
    'build-pf2',
].map((name) => {
  let file = 'js/'+name+'.js';
  let content = fs.readFileSync(file, { encoding: 'utf8' });
  return content.trim();
});

let jsComponents = components.map((component) => {
  let js = component.js.trim();
  if (js == "") {
    return "";
  }
  return `try {
${js}
} catch (e) { 
  console.log("Error in ${component.name}", e)
}`;
}).filter((component) => component != "");

scripts = `${scripts.join('\n')};
addEventListener('load', () => {
  ${jsComponents.join('\n')}
});`;

fs.writeFile('../dist/htdocs/script.js', scripts, (err) => {
  if (err) {
    error("make", "Script ERROR".red, err);
    hasError = true;
  } else {
    log("make", "Script OK".green);
  }
});


// Build pages

loadReady().then((gameData) => {
  let templateOptions = {
    languages,
    currentYear: new Date().getFullYear(),
    news: getNews(),
    pathfinder2: gameData.pathfinder2,
    pathfinder1: gameData.pathfinder1,
    starfinder1: gameData.starfinder1,
    dnd35: gameData.dnd35,
  };

  fs.writeFile('../debug/pf2.json', JSON.stringify(gameData.pathfinder2, null, 2), 'utf-8', () => {
  });
  
  let pages = fs.readdirSync('pages');
  for (let lang of languages) {
    fs.mkdir('../dist/htdocs/'+lang, {recursive: true}, (err) => {
      if (err) {
        error("make", "Language mkdir ERROR ".red+err);
        hasError = true;
      }
    });

    // write language-specific data file
    let pageData = JSON.stringify(getPageData(gameData.combo, lang));
    fs.writeFile('../dist/htdocs/'+lang+'/data.json', pageData, (err) => {
      if (err) {
        error("make", "Data ERROR".red, err);
        hasError = true;
      } else {
        log("make", "Data OK".green);
      }
    });

    // write translated pages
    for (let page of pages) {
      let name = page.replace(/\.html\.hbs$/, '');
      let pageBody = fs.readFileSync('pages/'+page, { encoding: 'utf8' });
      let pageTemplate = Handlebars.compile(pageBody);

      let pageOptions = {
        lang,
        page: name,
        ...templateOptions
      }

      try {
        let pageContent = pageTemplate(pageOptions);

        fs.writeFile('../dist/htdocs/'+lang+'/'+name+'.html', pageContent, (err) => {
          if (err) {
            error("make", "Page ERROR".red, name+" ("+lang+")", err);
            hasError = true;
          } else {
            // log("make", "Page OK".green, name+" ("+lang+")");
          }
        });
      } catch (e) {
        error("make", "Error in page".red, name, e);
        hasError = true;
      }
    }
  }
});


// Copy static files
log("make", "Copying static files");
fse.copy('static', '../dist/htdocs', (err) => {
    if (err) {
        error("make", "Static ERROR".red, err);
        hasError = true;
    } else {
        log("make", "Static files copied".green);
    }
});

fse.copy('app', '../dist/app', (err) => {
  if (err) {
      error("make", "App ERROR".red, err);
      hasError = true;
  } else {
      log("make", "App files copied".green);
  }
});

setTimeout(() => {
  if (hasError) {
    console.log("#### BUILD ERROR ####".red);
    process.exit(1);
  }
}, 2000);
