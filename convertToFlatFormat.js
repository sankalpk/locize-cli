const gettextToI18next = require('i18next-conv').gettextToI18next;
const csvjson = require('csvjson');
const xlsx = require('xlsx');
const jsyaml = require('js-yaml');
const asr2js = require('android-string-resource/asr2js');
const stringsFile = require('strings-file');
const xliff2js = require('xliff/xliff2js');
const xliff12ToJs = require('xliff/xliff12ToJs');
const targetOfjs = require('xliff/targetOfjs');
const sourceOfjs = require('xliff/sourceOfjs');
const resx2js = require('resx/resx2js');
const ftl2js = require('fluent_conv/ftl2js');
const tmx2js = require('tmexchange/tmx2js');
const laravel2js = require('laravelphp/laravel2js');
const javaProperties = require('@js.properties/properties');
const flatten = require('flat');

const convertToFlatFormat = (opt, data, lng, cb) => {
  if (!cb) {
    cb = lng;
    lng = undefined;
  }
  try {
    if (opt.format === 'json' || opt.format === 'flat') {
      cb(null, flatten(JSON.parse(data.toString())));
      return;
    }
    if (opt.format === 'po' || opt.format === 'gettext') {
      try {
        gettextToI18next(opt.referenceLanguage, data.toString(), {
          persistMsgIdPlural: true,
          ignoreCtx: true
        }).then((ret) => {
          try {
            cb(null, flatten(JSON.parse(ret.toString())));
          } catch (err) {
            cb(err);
          }
        }, cb);
      } catch (err) {
        cb(err);
      }
      return;
    }
    if (opt.format === 'po_i18next' || opt.format === 'gettext_i18next') {
      try {
        gettextToI18next(opt.referenceLanguage, data.toString()).then((ret) => {
          try {
            cb(null, flatten(JSON.parse(ret.toString())));
          } catch (err) {
            cb(err);
          }
        }, cb);
      } catch (err) {
        cb(err);
      }
      return;
    }
    if (opt.format === 'csv') {
      const options = {
        delimiter: ',',
        quote: '"'
      };

      // CRLF => LF
      var text = data.toString().replace(/\r\n/g, '\n');

      // handle multiline stuff
      const lines = text.split('\n');
      const toHandle = [];
      lines.forEach((l) => {
        const amountOfOccurrencies = l.split('"').length - 1;
        if (amountOfOccurrencies % 2 === 1) toHandle.push(l);
      });
      while (toHandle.length > 1) {
        var firstToHandle = toHandle.shift();
        const secondToHandle = toHandle.shift();
        const indexOfFirst = lines.indexOf(firstToHandle);
        const indexOfSecond = lines.indexOf(secondToHandle);
        var handlingIndex = indexOfFirst;
        while (handlingIndex < indexOfSecond) {
          firstToHandle += `\\NeWlInE\\${lines[handlingIndex + 1]}`;
          handlingIndex++;
        }
        lines[indexOfFirst] = firstToHandle;
        lines.splice(indexOfFirst + 1, indexOfSecond - indexOfFirst);
      }
      text = lines.join('\n');

      // https://en.wikipedia.org/wiki/Delimiter-separated_values
      // temporary replace "" with \_\" so we can revert this 3 lines after
      const jsonData = csvjson.toObject(text.replace(/""/g, '\\_\\"'), options);
      data = jsonData.reduce((mem, entry) => {
        if (entry.key && typeof entry[opt.referenceLanguage] === 'string') {
          mem[
            entry.key.replace(/\\_\\"/g, '"').replace(/\\NeWlInE\\/g, '\n')
          ] = entry[opt.referenceLanguage]
            .replace(/\\_\\"/g, '"')
            .replace(/\\NeWlInE\\/g, '\n');
        }
        return mem;
      }, {});
      cb(null, data);
      return;
    }
    if (opt.format === 'xlsx') {
      const wb = xlsx.read(data, { type: 'buffer' });
      const jsonData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      data = jsonData.reduce((mem, entry) => {
        if (entry.key && typeof entry[opt.referenceLanguage] === 'string') {
          mem[entry.key] = entry[opt.referenceLanguage];
        }
        return mem;
      }, {});
      cb(null, data);
      return;
    }
    if (opt.format === 'yaml') {
      cb(null, flatten(jsyaml.safeLoad(data)));
      return;
    }
    if (opt.format === 'yaml-rails') {
      const jsObj = jsyaml.safeLoad(data);
      cb(
        null,
        flatten(
          jsObj[Object.keys(jsObj)[0]][
            Object.keys(jsObj[Object.keys(jsObj)[0]])[0]
          ]
        )
      );
      return;
    }
    if (opt.format === 'android') {
      asr2js(data.toString(), { comment: 'right' }, (err, res) => {
        if (err) return cb(err);
        Object.keys(res).forEach((k) => {
          if (res[k] !== 'string' && typeof res[k].comment === 'string') {
            res[k] = {
              value: res[k].value,
              context: {
                text: res[k].comment,
              },
            };
          } else {
            res[k] = { value: res[k].value || res[k] };
          }
        });
        cb(null, res);
      });
      return;
    }
    if (opt.format === 'strings') {
      // CRLF => LF
      data = stringsFile.parse(data.toString().replace(/\r\n/g, '\n'), false);
      cb(null, data);
      return;
    }
    if (
      opt.format === 'xliff2' ||
      opt.format === 'xliff12' ||
      opt.format === 'xlf2' ||
      opt.format === 'xlf12'
    ) {
      const fn =
        opt.format === 'xliff12' || opt.format === 'xlf12'
          ? xliff12ToJs
          : xliff2js;
      fn(data.toString(), (err, res) => {
        if (err) return cb(err);
        res.resources = res.resources || {};
        const ns = Object.keys(res.resources)[0];
        const orgRes = res.resources[ns] || res.resources;
        function checkForContext(nsRes) {
          Object.keys(nsRes).forEach((k) => {
            if (orgRes[k].note && (typeof nsRes[k] === 'string' || !nsRes[k])) {
              nsRes[k] = {
                value: nsRes[k],
                context: {
                  text: orgRes[k].note,
                },
              };
            }
          });
          return nsRes;
        }
        if (!res.targetLanguage) {
          sourceOfjs(res, (err, ret) => {
            if (err) return cb(err);
            cb(null, checkForContext(ret));
          });
        } else {
          targetOfjs(res, (err, ret) => {
            if (err) return cb(err);
            if (lng !== opt.referenceLanguage) return cb(null, checkForContext(ret));
            ret = ret || {};
            const keys = Object.keys(ret);
            if (keys.length === 0) return cb(null, checkForContext(ret));
            const allEmpty = keys.filter((k) => ret[k] !== '').length === 0;
            if (!allEmpty) return cb(null, checkForContext(ret));
            sourceOfjs(res, (err, ret) => {
              if (err) return cb(err);
              cb(null, checkForContext(ret));
            });
          });
        }
      });
      return;
    }
    if (opt.format === 'resx') {
      resx2js(data.toString(), (err, res) => {
        if (err) return cb(err);
        res = Object.keys(res).reduce((mem, k) => {
          const value = res[k];
          if (typeof value === 'string') {
            mem[k] = value;
          } else if (value.value) {
            mem[k] = {
              value: value.value,
              context: value.comment ? { text: value.comment } : null,
            };
          }
          return mem;
        }, {});
        cb(null, res);
      });
      return;
    }
    if (opt.format === 'fluent') {
      const fluentJS = ftl2js(
        data
          .toString()
          .replace(
            new RegExp(String.fromCharCode(160), 'g'),
            String.fromCharCode(32)
          )
      );
      const comments = {};
      Object.keys(fluentJS).forEach((prop) => {
        if (fluentJS[prop] && fluentJS[prop].comment) {
          comments[prop] = fluentJS[prop].comment;
          delete fluentJS[prop].comment;
        }
      });
      const res = flatten(fluentJS);
      if (res && comments) {
        Object.keys(comments).forEach((prop) => {
          res[`${prop}.val`] = {
            value: res[`${prop}.val`],
            context: comments[prop] ? { text: comments[prop] } : null,
          };
        });
      }
      cb(null, res);
      return;
    }
    if (opt.format === 'tmx') {
      tmx2js(data.toString(), (err, jsonData) => {
        if (err) return cb(err);
        const tmxJsRes = jsonData.resources[Object.keys(jsonData.resources)[0]];
        const res = {};
        if (tmxJsRes) {
          Object.keys(tmxJsRes).forEach((k) => {
            res[k] = tmxJsRes[k][opt.referenceLanguage];
          });
        }
        cb(null, res);
      });
      return;
    }
    if (opt.format === 'laravel') {
      cb(null, flatten(laravel2js(data.toString())));
      return;
    }
    if (opt.format === 'properties') {
      cb(null, javaProperties.parseToProperties(data.toString()));
      return;
    }
    cb(new Error(`${opt.format} is not a valid format!`));
  } catch (err) {
    cb(err);
  }
};

module.exports = convertToFlatFormat;
