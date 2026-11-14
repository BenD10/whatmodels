/**
 * Copy-paste commands that download and run one models.json row locally.
 *
 * Both tools take the Hugging Face "repo:tag" form, where the tag is the
 * quantization as it appears in the GGUF filename (case-insensitive):
 *   ollama run hf.co/<owner>/<repo>:<tag>        (https://huggingface.co/docs/hub/ollama)
 *   llama-server -hf <owner>/<repo>:<tag>        (llama.cpp tools/server README)
 *
 * - Vision: both fetch the repo's mmproj projector on their own (Ollama gets it
 *   as a manifest layer; llama.cpp downloads it with -hf unless --no-mmproj).
 * - Sharded GGUFs (-00001-of-0000N.gguf): llama.cpp downloads the whole set.
 *   The Hub refuses to serve them to Ollama ("Ollama does not yet support
 *   pulling sharded GGUF"), so rows with gguf_shards > 1 get no Ollama command.
 * - The tag is matched as a whole token, so "Q4_K_M" never picks a UD-Q4_K_XL
 *   file. scripts/models/backfill_gguf_repo.py checks every stored row's tag
 *   resolves to the verified file in both tools.
 */

/** Tag passed for each stored quantization. Keep in step with RUN_TAGS in scripts/models/model_script_utils.py. */
export const RUN_TAGS = { Q4_K_M: 'Q4_K_M', Q4_K_S: 'Q4_K_S', Q8_0: 'Q8_0', fp16: 'F16' };

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Quant names as filenames carry them, e.g. Q4_K_M, IQ4_XS, UD-Q4_K_XL
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The filename tag for a row's quantization, or null if it can't be expressed safely. */
export function runTag(quantization) {
  const tag = RUN_TAGS[quantization] ?? quantization;
  return typeof tag === 'string' && TAG_RE.test(tag) ? tag : null;
}

/**
 * Commands for one row, or null when the row has no verified gguf_repo.
 *
 * Returns { repo, tag, sharded, vision, commands: [{ tool, label, command }] }.
 * `commands` always has llama.cpp; Ollama only for single-file GGUFs.
 */
export function runCommands(row) {
  const repo = row?.gguf_repo;
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) return null;
  const tag = runTag(row.quantization);
  if (!tag) return null;

  const sharded = (row.gguf_shards ?? 1) > 1;
  const commands = [];
  if (!sharded) {
    commands.push({ tool: 'ollama', label: 'Ollama', command: `ollama run hf.co/${repo}:${tag}` });
  }
  commands.push({ tool: 'llama.cpp', label: 'llama.cpp', command: `llama-server -hf ${repo}:${tag}` });

  return {
    repo,
    tag,
    sharded,
    vision: (row.features ?? []).includes('vision'),
    commands,
  };
}
