const loaderUtils = require('loader-utils');
const path = require('path');

const filterMatchedImports = (importStrings, context, currentImportPath) => {
  currentImportPath = currentImportPath.replace(/(\.scss|\.sass)$/, '');

  return importStrings.filter(importString => {
    const importPath = importString.match(/['"]([^'"]+)?['"]/)[1].replace(/(\.scss|\.sass)$/, '');
    return path.resolve(currentImportPath) === path.join(context, importPath);
  });
};

exports.default = function (content) {
  const options = loaderUtils.getOptions(this);
  const callback = this.async();
  this.cacheable(true);

  const replaceForImport = (defaultImportFileName, index) => {
    const regexFilename = defaultImportFileName.replace(/\./, '\\.');
    const pathMatch = `['"]([^'"]+${regexFilename}(\\.scss|\\.sass)?)['"];?`;

    const importPatterns = `@import\\s+${pathMatch}`;
    const matchedImports = content.match(new RegExp(importPatterns, 'g'));
    if (matchedImports) {
      const replaceStrings = filterMatchedImports(matchedImports, this.context, options.defaultImportPaths[index]);
      replaceStrings.forEach(importString => {
        content = content.replace(importString, `@import '${path.relative(this.context, options.targetImportPaths[index])}';`);
      });
    }

    const composesPatterns = `composes\\s*\:\\s*[^\\s]+\\s+from\\s+${pathMatch}`;
    const matchedComposes = content.match(new RegExp(composesPatterns, 'g'));
    if (matchedComposes) {
      const replaceStrings = filterMatchedImports(matchedComposes, this.context, options.defaultImportPaths[index]);
      replaceStrings.forEach(importString => {
        const replaceString = importString.replace(/['"][^'"]+['"]/, `"${path.relative(this.context, options.targetImportPaths[index])}"`);
        content = content.replace(importString, replaceString);
      });
    }
  };

  options.defaultImportFilenames.forEach(replaceForImport);

  callback(null, content);
};
