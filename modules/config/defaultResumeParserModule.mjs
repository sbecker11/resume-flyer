/**
 * `python -m` module for the **resume-parser** package when RESUME_PARSER_MODULE is unset.
 * Override with env `RESUME_PARSER_MODULE` if you use a different entry point.
 */
export const RESUME_PARSER_PYTHON_MODULE_UNSET_ENV = 'resume_parser.resume_to_json'

/**
 * Default resume-parser project path (relative to resume-flyer root):
 *   ../resume-parser
 * Override with env `RESUME_PARSER_PROJECT_PATH`.
 */
export const RESUME_PARSER_PROJECT_PATH_RELATIVE_UNSET_ENV = '../resume-parser'
