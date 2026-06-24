export const SUPPORTED_LANGUAGES = [
  'abap',
  'actionscript-3',
  'ada',
  'angular-html',
  'angular-ts',
  'apache',
  'apex',
  'apl',
  'applescript',
  'ara',
  'asciidoc',
  'asm',
  'astro',
  'awk',
  'ballerina',
  'bat',
  'beancount',
  'berry',
  'bibtex',
  'bicep',
  'blade',
  'bsl',
  'c',
  'cadence',
  'cairo',
  'clarity',
  'clojure',
  'cmake',
  'cobol',
  'codeowners',
  'codeql',
  'coffee',
  'common-lisp',
  'coq',
  'cpp',
  'crystal',
  'csharp',
  'css',
  'csv',
  'cue',
  'cypher',
  'd',
  'dart',
  'dax',
  'desktop',
  'diff',
  'docker',
  'dotenv',
  'dream-maker',
  'edge',
  'elixir',
  'elm',
  'emacs-lisp',
  'erb',
  'erlang',
  'fennel',
  'fish',
  'fluent',
  'fortran-fixed-form',
  'fortran-free-form',
  'fsharp',
  'gdresource',
  'gdscript',
  'gdshader',
  'genie',
  'gherkin',
  'git-commit',
  'git-rebase',
  'gleam',
  'glimmer-js',
  'glimmer-ts',
  'glsl',
  'gnuplot',
  'go',
  'graphql',
  'groovy',
  'hack',
  'haml',
  'handlebars',
  'haskell',
  'haxe',
  'hcl',
  'hjson',
  'hlsl',
  'html',
  'html-derivative',
  'http',
  'hxml',
  'hy',
  'imba',
  'ini',
  'java',
  'javascript',
  'jinja',
  'jison',
  'json',
  'json5',
  'jsonc',
  'jsonl',
  'jsonnet',
  'jssm',
  'jsx',
  'julia',
  'kotlin',
  'kusto',
  'latex',
  'lean',
  'less',
  'liquid',
  'llvm',
  'log',
  'logo',
  'lua',
  'luau',
  'make',
  'markdown',
  'marko',
  'matlab',
  'mdc',
  'mdx',
  'mermaid',
  'mipsasm',
  'mojo',
  'move',
  'narrat',
  'nextflow',
  'nginx',
  'nim',
  'nix',
  'nushell',
  'objective-c',
  'objective-cpp',
  'ocaml',
  'pascal',
  'perl',
  'php',
  'plsql',
  'po',
  'polar',
  'postcss',
  'powerquery',
  'powershell',
  'prisma',
  'prolog',
  'proto',
  'pug',
  'puppet',
  'purescript',
  'python',
  'qml',
  'qmldir',
  'qss',
  'r',
  'racket',
  'raku',
  'razor',
  'reg',
  'regexp',
  'rel',
  'riscv',
  'rst',
  'ruby',
  'rust',
  'sas',
  'sass',
  'scala',
  'scheme',
  'scss',
  'sdbl',
  'shaderlab',
  'shellscript',
  'shellsession',
  'smalltalk',
  'solidity',
  'soy',
  'sparql',
  'splunk',
  'sql',
  'ssh-config',
  'stata',
  'stylus',
  'svelte',
  'swift',
  'system-verilog',
  'systemd',
  'talonscript',
  'tasl',
  'tcl',
  'templ',
  'terraform',
  'tex',
  'toml',
  'ts-tags',
  'tsv',
  'tsx',
  'turtle',
  'twig',
  'typescript',
  'typespec',
  'typst',
  'v',
  'vala',
  'vb',
  'verilog',
  'vhdl',
  'viml',
  'vue',
  'vue-html',
  'vue-vine',
  'vyper',
  'wasm',
  'wenyan',
  'wgsl',
  'wikitext',
  'wit',
  'wolfram',
  'text',
  'xml',
  'xsl',
  'yaml',
  'zenscript',
  'zig',
]
/**
 * 语言别名映射表
 * 将常见的语言简写映射到完整的语言名称
 */
const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  'bash': 'shellscript',
  'sh': 'shellscript',
  'shell': 'shellscript',
  'zsh': 'shellscript',
  'fish': 'fish', // fish 在 shiki 中有独立支持
  'powershell': 'powershell', // powershell 在 shiki 中有独立支持
  // JavaScript 相关
  'js': 'javascript',
  'jsx': 'jsx',

  // TypeScript 相关
  'ts': 'typescript',

  // Python 相关
  'py': 'python',

  'htm': 'html',
  // Markdown 相关
  'md': 'markdown',
  // YAML 相关
  'yml': 'yaml',

  // Go 相关
  'golang': 'go',

  // Rust 相关
  'rs': 'rust',
  'rb': 'ruby',

  // C++ 相关
  'c++': 'cpp',

  // C# 相关
  'cs': 'csharp',
  'c#': 'csharp',

  // Vim 相关
  'vim': 'viml',

  // Docker 相关
  'dockerfile': 'docker',

  // 其他常见别名
  'txt': 'text',
  'plaintext': 'text',
}

/**
 * 语言映射函数
 * 将用户输入的语言标识符映射到 shiki 支持的语言
 */
export function mapLanguageToShiki(language: string): string {
  const lowerLanguage = language.toLowerCase()

  // 如果已经是支持的语言，直接返回
  if (SUPPORTED_LANGUAGES.includes(lowerLanguage)) {
    return lowerLanguage
  }

  // 检查语言别名映射
  const aliasMappedLanguage = LANGUAGE_ALIAS_MAP[lowerLanguage]
  if (aliasMappedLanguage) {
    return aliasMappedLanguage
  }

  // 如果都不匹配，返回原始语言（让后续处理决定是否支持）
  return language
}

export function isSupportedLanguage(language: string): boolean {
  const mappedLanguage = mapLanguageToShiki(language)
  return SUPPORTED_LANGUAGES.includes(mappedLanguage)
}
/**
 * 从 Markdown 内容中检测所有使用的代码块语言
 * 通过正则提取 fenced code block 的语言标识符，无需依赖 markdown-it 完整解析。
 * @param content Markdown 内容
 * @returns 检测到的语言列表（去重）
 */
export function detectLanguages(content: string): string[] {
  try {
    const languages = new Set<string>()

    // 匹配 ``` 和 ~~~ 两种 fenced code block 的起始行，提取语言标识符
    // 格式: ```language 或 ~~~language，language 后面可能跟空格和参数
    const fenceRegex = /^(?:`{3,}|~{3,})[ \t]*(\S+)/gm
    let match: RegExpExecArray | null

    while ((match = fenceRegex.exec(content)) !== null) {
      let lang = match[1].trim()

      // 处理带有行号范围的语言标识符，如 javascript{1,5,8-10}
      const lineNumberMatch = lang.match(/^([^{]+)(?:\{.+\})?$/)
      if (lineNumberMatch && lineNumberMatch[1]) {
        lang = lineNumberMatch[1].trim()
      }
      if (lang) {
        // 使用语言映射，将 shell 相关语言映射到 shellscript
        const mappedLang = mapLanguageToShiki(lang)
        languages.add(mappedLang)
      }
    }

    return Array.from(languages).sort()
  }
  catch {
    return []
  }
}
