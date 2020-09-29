const loaderUtils = require('loader-utils');
const path = require('path');

const filterMatchedImports = (importStrings, context, currentImportPath) => {
  currentImportPath = currentImportPath.replace(/(\.scss|\.sass)$/, '');

  return importStrings.filter(importString => {
    const importPath = importString.match(/['"]([^'"]+)(\.scss|\.sass)?['"]/)[1];
    return currentImportPath === path.join(context, importPath);
  });
};

exports.default = function (content) {
  const options = loaderUtils.getOptions(this);
  const callback = this.async();

  const regexFilename = options.defaultImportFilename.replace(/\./, '\\.');
  const importPatterns = `@import\\s+['"]([^'"]+${regexFilename}(\\.scss|\\.sass)?)['"];?`;
  const matchedImports = content.match(new RegExp(importPatterns, 'g'));

  if (!matchedImports) {
    callback(null, content);
    return;
  }

  const replaceImports = filterMatchedImports(matchedImports, this.context, options.defaultImportPath);
  replaceImports.forEach(importString => {
    content = content.replace(importString, `@import '${path.relative(this.context, options.targetImportPath)}';`)
  });

  callback(null, content);
};
