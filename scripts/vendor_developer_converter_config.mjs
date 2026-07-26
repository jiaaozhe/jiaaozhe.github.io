export * as YAML from 'yaml';
export {
    LosslessNumber,
    isLosslessNumber,
    isSafeNumber,
    parse as parseLosslessJson,
    stringify as stringifyLosslessJson
} from 'lossless-json';
export {
    TomlDate,
    TomlError,
    parse as parseToml,
    stringify as stringifyToml
} from 'smol-toml';
