const const_start = /[A-Z]/,
  ident_start = /[a-z_\u{00a0}-\u{10ffff}]/u,
  ident_part = /[0-9A-Za-z_\u{00a0}-\u{10ffff}]/u,
  bracket_pairs = [
    ['(', ')', '\\)'],
    ['[', ']', '\\]'],
    ['{', '}', '\\}'],
    ['<', '>', '>'],
    ['|', '|', '\\|'],
  ],
  PREC = {
    DEFAULT: 0,
    LOGICAL_OR: 1,
    LOGICAL_AND: 2,
    INCLUSIVE_OR: 3,
    EXCLUSIVE_OR: 4,
    BITWISE_AND: 5,
    EQUAL: 6,
    RELATIONAL: 7,
    SHIFT: 9,
    ADD: 10,
    MULTIPLY: 11,
  };

module.exports = grammar({
  name: 'crystal',

  extras: $ => [/[\s\r\n]+/],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.percent_string, $._binary_operator],
    [$.regex_literal, $._binary_operator],
    [$.integer],
  ],

  // TODO: separate binary_operation into specific operator groups
  precedences: $ => [
    [
      'binary_operation',
      //   'index_operator',
      //   'dot_accesss',
      //   'unary_operator',
      //   'exponent_operator',
      //   'product_operator',
      //   'sum_operator',
      //   'shift_operator',
      //   'binary_and',
      //   'binary_or',
      //   'equality_operator',
      //   'comparison_operator',
      //   'logic_and',
      //   'logic_or',
      //   'range_operator',
      //   'ternary_operator',
      //   'assign',
      'splat_operator',
      //   'comma',
    ],
  ],

  rules: {
    source_file: $ => seq(optional($._statements)),

    _terminator: $ => choice(/\r?\n/, ';'),

    _statements: $ =>
      choice(
        seq(
          repeat1(choice(seq($._statement, $._terminator), prec(-1, ';'))),
          optional($._statement),
        ),
        $._statement,
      ),

    _statement: $ =>
      choice(
        $.require,
        $.class,
        $.struct,
        $.module,
        $.include,
        $.extend,
        $.abstract_def,
        $.def,
        $.return,
        $._expression,
      ),

    class: $ =>
      seq(
        optional($.private),
        optional($.abstract),
        'class',
        field('name', $.type_name),
        optional($.inherit),
        $._terminator,
        optional($._statements),
        'end',
      ),

    struct: $ =>
      seq(
        optional($.private),
        optional($.abstract),
        'struct',
        field('name', $.type_name),
        optional($.inherit),
        $._terminator,
        optional($._statements),
        'end',
      ),

    type_name: $ => seq($.constant, optional($.generics)),

    generics: $ => seq('(', $.type_name, repeat(seq(',', $.type_name)), optional(','), ')'),

    inherit: $ => seq('<', $.type_name),

    module: $ =>
      seq(
        optional($.private),
        'module',
        field('name', $.type_name),
        $._terminator,
        optional($._statements),
        'end',
      ),

    include: $ => seq('include', $.constant),

    extend: $ => seq('extend', choice($.constant, $.self)),

    _base_def: $ =>
      prec.right(
        seq(
          'def',
          optional(field('class', seq(choice($.constant, $.self), '.'))),
          field('name', choice($.identifier, $._binary_operator)),
          optional(
            field(
              'params',
              seq(
                '(',
                optional(
                  seq(
                    $.method_param,
                    repeat(seq(',', $.method_param)),
                    optional(','),
                  )
                ),
                // optional(seq($.splat_param, optional(','))),
                // optional(seq($.double_splat_param, optional(','))),
                // optional(seq($.block_param, optional(','))),
                ')',
              ),
            ),
          ),
          optional(field('returns', seq(':', $.type_name))),
          optional(
            field(
              'forall',
              seq('forall', $.constant, repeat(seq(',', $.type_name))),
            ),
          ),
        ),
      ),

    abstract_def: $ =>
      seq(optional(choice($.private, $.protected)), 'abstract', $._base_def),

    def: $ =>
      seq(
        optional(choice($.private, $.protected)),
        $._base_def,
        optional($._statements),
        'end',
      ),

    return: $ => seq('return', optional($._expression)),

    _expression: $ =>
      choice(
        $.binary_operation,
        $.string,
        $.regex_literal,
        $.nil,
        $.true,
        $.false,
        $.integer,
        $.float,
        $.array,
        $.hash,
        $.proc,
        $.char,
        $.symbol,
        $.instance_variable,
        $.class_variable,
        $.self,
        $.identifier,
        $.constant,
        $.comment,
        $.line_pseudo_constant,
        $.endline_pseudo_constant,
        $.file_pseudo_constant,
        $.dir_pseudo_constant,
      ),

    string: $ => choice($.quoted_string, $.percent_string),

    quoted_string: $ => seq('"', repeat(/[^"]/), '"'),

    // TODO: Allow nested brackets
    percent_string: $ =>
      choice(
        ...bracket_pairs.map(([start, end, escaped_end]) =>
          seq(
            '%',
            optional('q'),
            start,
            repeat(new RegExp(`[^${escaped_end}]`)),
            end,
          ),
        ),
      ),

    regex_literal: $ => seq('/', repeat(/[^\/]|\\\//), '/'),

    require: $ => seq('require', $.quoted_string),

    integer: $ =>
      seq(
        choice(
          '0',
          seq('0_', repeat(/[0-9_]/)),
          seq('0b', repeat(choice('0', '1', '_'))),
          seq('0o', repeat(/[0-7_]/)),
          seq('0x', repeat(/[a-fA-F0-9_]/)),
          seq(/[1-9]/, repeat(/[0-9_]/)),
        ),
        optional(
          choice(
            'i8',
            'i16',
            'i32',
            'i64',
            'i128',
            'u8',
            'u16',
            'u32',
            'u64',
            'u128',
          ),
        ),
      ),

    float: $ =>
      seq(
        choice('0', '0_', /[1-9]/),
        repeat(/[0-9_]/),
        '.',
        repeat1(/[0-9_]/),
        optional(
          seq(
            choice('e', 'E'),
            optional(choice('+', '-')),
            /[0-9_]/,
            repeat(/[0-9_]/),
          ),
        ),
        optional(choice('f32', 'f64')),
      ),

    nil: $ => 'nil',

    true: $ => 'true',
    false: $ => 'false',

    array: $ =>
      seq(
        '[',
        optional(
          choice(
            $._expression,
            seq($._expression, repeat(seq(',', $._expression))),
          ),
        ),
        ']',
        optional(seq('of', $.type_name)),
      ),

    hash: $ =>
      choice(
        seq(
          '{',
          $._expression,
          '=>',
          $._expression,
          repeat(seq(',', $._expression, '=>', $._expression)),
          '}',
          optional(
            seq(
              'of',
              field('key_type', $.type_name),
              '=>',
              field('value_type', $.type_name),
            ),
          ),
        ),
        seq(
          '{',
          '}',
          'of',
          field('key_type', $.type_name),
          '=>',
          field('value_type', $.type_name),
        ),
      ),

    proc: $ =>
      seq(
        '->',
        optional(
          seq(
            '(',
            field(
              'params',
              seq($.proc_param, repeat(seq(',', $.proc_param))),
              optional(','),
            ),
            ')',
          ),
        ),
        optional(seq(':', field('return_type', $.type_name))),
        $.block,
      ),

    proc_param: $ =>
      seq(
        field('name', $.identifier), // support class/instance vars
        optional(seq(':', field('type', $.type_name))),
      ),

    method_param: $ =>
      seq(
        // repeat($.annotation),
        optional(field('external_name', $.identifier)),
        field('name', $.identifier), // support class/instance vars
        optional(seq(':', field('type', $.type_name))),
        optional(seq('=', field('default_value', $._expression))),
      ),

    // splat_param: $ =>
    //   seq(
    //     // repeat($.annotation),
    //     prec('splat_operator', '*'),
    //     field('name', $.identifier),
    //     optional(seq(':', field('type', $.constant))),
    //   ),

    // double_splat_param: $ =>
    //   seq(
    //     // repeat($.annotation),
    //     prec('splat_operator', '**'),
    //     field('name', $.identifier),
    //     optional(seq(':', field('type', $.constant))),
    //   ),

    // block_param: $ =>
    //   seq(
    //     // repeat($.annotation),
    //     '&',
    //     optional(field('name', $.identifier)),
    //     optional(seq(':', field('type', $.constant))),
    //   ),

    args: $ => seq($._expression),

    block: $ => choice($.brace_block, $.do_end_block),

    block_params: $ =>
      seq(
        '|',
        field('params', $.identifier, repeat(seq(',', $.identifier))),
        '|',
      ),

    brace_block: $ =>
      seq('{', optional($.block_params), optional($._statements), '}'),

    do_end_block: $ =>
      seq('do', optional($.block_params), optional($._statements), 'end'),

    char: $ =>
      seq(
        "'",
        choice(
          token.immediate(/[^\\]/),
          seq(
            '\\',
            choice(
              '0',
              '\\',
              "'",
              'a',
              'b',
              'e',
              'f',
              'n',
              'r',
              't',
              'v',
              choice(/u[0-9a-fA-F]{4}/, /u\{[0-9a-fA-F]{1,6}\}/),
            ),
          ),
        ),
        token.immediate("'"),
      ),

    symbol: $ => seq(':', choice($.identifier, $.string)),

    instance_variable: $ => seq('@', $.identifier),

    class_variable: $ => seq('@@', $.identifier),

    self: $ => 'self',

    abstract: $ => 'abstract',

    protected: $ => 'protected',

    private: $ => 'private',

    identifier: $ => token(seq(ident_start, repeat(ident_part))),

    constant: $ =>
      prec.right(
        seq(
          optional('::'),
          $._constant_segment,
          repeat(seq('::', $._constant_segment)),
        ),
      ),

    _constant_segment: $ => token(seq(const_start, repeat(ident_part))),

    line_pseudo_constant: $ => '__LINE__',

    endline_pseudo_constant: $ => '__END_LINE__',

    file_pseudo_constant: $ => '__FILE__',

    dir_pseudo_constant: $ => '__DIR__',

    comment: $ => seq('#', /.*/),

    // splat: $ =>
    //   prec('splat_operator', seq('*', token.immediate($._expression))),

    // double_splat: $ =>
    //   prec('splat_operator', seq('**', token.immediate($._expression))),

    // https://github.com/will/tree-sitter-crystal/blob/15597b307b18028b04d288561f9c29794621562b/grammar.js#L545
    binary_operation: $ => {
      const table = [
        ['+', PREC.ADD],
        ['&+', PREC.ADD],
        ['-', PREC.ADD],
        ['&-', PREC.ADD],
        ['*', PREC.MULTIPLY],
        ['&*', PREC.MULTIPLY],
        ['/', PREC.MULTIPLY],
        ['//', PREC.MULTIPLY],
        ['%', PREC.MULTIPLY],
        ['||', PREC.LOGICAL_OR],
        ['&&', PREC.LOGICAL_AND],
        ['|', PREC.INCLUSIVE_OR],
        ['^', PREC.EXCLUSIVE_OR],
        ['&', PREC.BITWISE_AND],
        ['==', PREC.EQUAL],
        ['=~', PREC.EQUAL],
        ['!~', PREC.EQUAL],
        ['===', PREC.EQUAL],
        ['<=>', PREC.EQUAL],
        ['!=', PREC.EQUAL],
        ['>', PREC.RELATIONAL],
        ['>=', PREC.RELATIONAL],
        ['<=', PREC.RELATIONAL],
        ['<', PREC.RELATIONAL],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
      ];

      return choice(...table.map(([operator, precedence]) => {
        return prec.left(precedence, seq(
          field('left', $._expression),
          // @ts-ignore
          field('operator', operator),
          field('right', $._expression),
        ));
      }));
    },

    _binary_operator: $ =>
      choice(
        '+',
        '&+',
        '-',
        '&-',
        '*',
        '&*',
        '/',
        '//',
        '%',
        '&',
        '|',
        '^',
        '**',
        '>>',
        '<<',
        '==',
        '!=',
        '<',
        '<=',
        '>',
        '>=',
        '<=>',
        '===',
        '=~',
        '!~',
      ),
  },
});
