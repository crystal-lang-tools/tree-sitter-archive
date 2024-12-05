#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include <wctype.h>
#include <string.h>
#include <ctype.h>

enum TokenType
{
    HEREDOC_ARROW,
    HEREDOC_START,
    HEREDOC_BODY_PART,
    HEREDOC_BODY_END,
    ERROR_RECOVERY,
};

typedef Array(char) String;

typedef struct
{
    String delimiter;
} Heredoc;

#define heredoc_new()             \
    {                             \
        .delimiter = array_new(), \
    };

typedef struct
{
    Array(Heredoc) heredocs;
} Scanner;

// Helper methods

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline bool in_error_recovery(const bool *valid_symbols) { return valid_symbols[ERROR_RECOVERY]; }

static inline void reset_string(String *string)
{
    if (string->size > 0)
    {
        memset(string->contents, 0, string->size);
        array_clear(string);
    }
}

static inline void reset_heredoc(Heredoc *heredoc)
{
    reset_string(&heredoc->delimiter);
}

static inline void reset(Scanner *scanner)
{
    for (uint32_t i = 0; i < scanner->heredocs.size; i++)
    {
        reset_heredoc(array_get(&scanner->heredocs, i));
    }
}

// Tree sitter methods

// Copied from tree-sitter-bash
void *tree_sitter_crystal_external_scanner_create()
{
    Scanner *scanner = ts_malloc(sizeof(Scanner));
    array_init(&scanner->heredocs);
    return scanner;
}

void tree_sitter_crystal_external_scanner_destroy(void *payload)
{
    Scanner *scanner = (Scanner *)payload;
    for (size_t i = 0; i < scanner->heredocs.size; i++)
    {
        Heredoc *heredoc = array_get(&scanner->heredocs, i);
        array_delete(&heredoc->delimiter);
    }
    array_delete(&scanner->heredocs);
    ts_free(scanner);
}

static bool advance_word(TSLexer *lexer, String *word)
{
}

bool tree_sitter_crystal_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols)
{
    Scanner *scanner = (Scanner *)payload;
    uint32_t size = 0;
    lexer->log(lexer, "checking heredoc stuff");

    for (int i = 0; i < 4; i++)
    {
        lexer->log(lexer, "%i", valid_symbols[i]);
    }

    if (valid_symbols[HEREDOC_BODY_END] &&
        scanner->heredocs.size > 0 &&
        lexer->lookahead == '\n')
    {
        lexer->log(lexer, "found potential heredoc end");
        skip(lexer);
        while (iswspace(lexer->lookahead))
        {
            skip(lexer);
        }

        Heredoc *heredoc = array_back(&scanner->heredocs);
        lexer->log(lexer, "heredoc stack size %i", scanner->heredocs.size);

        int32_t size = 0;
        String leading_word = array_new();

        lexer->log(lexer, "checking heredoc end (0), %c, %i", lexer->lookahead, heredoc->delimiter.size);
        while (lexer->lookahead != '\0' && lexer->lookahead != '\n' &&
               leading_word.size < heredoc->delimiter.size)
        {
            lexer->log(lexer, "checking heredoc end (%i), %c", size, lexer->lookahead);
            array_push(&leading_word, lexer->lookahead);
            advance(lexer);
            size++;
        }

        array_push(&leading_word, '\0');

        // lexer->mark_end(lexer);

        while (lexer->lookahead != '\0' && lexer->lookahead != '\n')
        {
            if (!iswspace(lexer->lookahead))
            {
                return false;
            }
            advance(lexer);
        }

        bool valid_end = strcmp(leading_word.contents, heredoc->delimiter.contents) == 0;

        if (valid_end)
        {
            lexer->log(lexer, "found valid heredoc end");

            array_delete(&heredoc->delimiter);
            array_pop(&scanner->heredocs);

            lexer->mark_end(lexer);
            lexer->result_symbol = HEREDOC_BODY_END;
        }
        else
        {
            lexer->log(lexer, "not valid heredoc end");
            lexer->log(lexer, "leading: '%s'", leading_word);
            lexer->log(lexer, "delimit: '%s'", heredoc->delimiter);
        }

        array_delete(&leading_word);

        return valid_end;
    }

    if (valid_symbols[HEREDOC_ARROW])
    {
        while (iswspace(lexer->lookahead))
        {
            skip(lexer);
        }

        lexer->log(lexer, "checking heredoc arrow 1, %c", lexer->lookahead);
        if (lexer->lookahead == '<')
        {
            advance(lexer);
            lexer->log(lexer, "checking heredoc arrow 2, %c", lexer->lookahead);
            if (lexer->lookahead == '<')
            {
                advance(lexer);
                lexer->log(lexer, "checking heredoc arrow 3, %c", lexer->lookahead);
                if (lexer->lookahead == '-')
                {
                    lexer->log(lexer, "found heredoc arrow");
                    advance(lexer);
                    Heredoc heredoc = heredoc_new();
                    array_push(&scanner->heredocs, heredoc);
                    lexer->result_symbol = HEREDOC_ARROW;
                    return true;
                }
            }
        }
    }

    if (valid_symbols[HEREDOC_START] &&
        !in_error_recovery(valid_symbols) &&
        scanner->heredocs.size > 0)
    {
        lexer->log(lexer, "found potential heredoc start");
        Heredoc *heredoc = array_back(&scanner->heredocs);

        if (!isalnum(lexer->lookahead))
        {
            lexer->log(lexer, "not heredoc start");
            return false;
        }

        array_push(&heredoc->delimiter, lexer->lookahead);
        advance(lexer);
        lexer->log(lexer, "lexing heredoc delim (0), %c", lexer->lookahead);

        while (isalnum(lexer->lookahead) || lexer->lookahead == '_')
        {
            array_push(&heredoc->delimiter, lexer->lookahead);
            lexer->log(lexer, "lexing heredoc delim (%i), %c", heredoc->delimiter.size, lexer->lookahead);
            advance(lexer);
        }

        array_push(&heredoc->delimiter, '\0');

        lexer->result_symbol = HEREDOC_START;
        return true;
    }

    if (valid_symbols[HEREDOC_BODY_PART] && scanner->heredocs.size > 0)
    {
        lexer->log(lexer, "found potential heredoc body part");
        while (lexer->lookahead && lexer->lookahead != '\n')
        {
            skip(lexer);
        }

        Heredoc *heredoc = array_back(&scanner->heredocs);

        while (lexer->lookahead)
        {
            advance(lexer);

            if (lexer->lookahead == '\n')
            {
                break;
            }
            else if (lexer->lookahead == '#')
            {
                lexer->mark_end(lexer);
                advance(lexer);
                if (lexer->lookahead == '{')
                {
                    lexer->mark_end(lexer);
                    lexer->result_symbol = HEREDOC_BODY_PART;
                    return true;
                }
            }
        }

        lexer->result_symbol = HEREDOC_BODY_PART;
        return true;
    }

    lexer->log(lexer, "no heredoc stuff found");
    return false;
}

// Copied from tree-sitter-bash
unsigned tree_sitter_crystal_external_scanner_serialize(void *payload, char *buffer)
{
    Scanner *scanner = (Scanner *)payload;
    uint32_t size = 0;

    buffer[size++] = (char)scanner->heredocs.size;

    for (uint32_t i = 0; i < scanner->heredocs.size; i++)
    {
        Heredoc *heredoc = array_get(&scanner->heredocs, i);
        if (heredoc->delimiter.size + size >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE)
        {
            printf("delimiter size too big");
            return 0;
        }

        memcpy(&buffer[size], &heredoc->delimiter.size, sizeof(uint32_t));
        size += sizeof(uint32_t);
        if (heredoc->delimiter.size > 0)
        {
            memcpy(&buffer[size], heredoc->delimiter.contents, heredoc->delimiter.size);
            size += heredoc->delimiter.size;
        }
    }
    return size;
}

// Copied from tree-sitter-bash
void tree_sitter_crystal_external_scanner_deserialize(void *payload, const char *buffer, unsigned length)
{
    Scanner *scanner = (Scanner *)payload;
    if (length == 0)
    {
        reset(scanner);
    }
    else
    {
        uint32_t size = 0;
        uint32_t heredoc_count = (unsigned char)buffer[size++];
        for (uint32_t i = 0; i < heredoc_count; i++)
        {
            Heredoc *heredoc = NULL;
            if (i < scanner->heredocs.size)
            {
                heredoc = array_get(&scanner->heredocs, i);
            }
            else
            {
                Heredoc new_heredoc = heredoc_new();
                array_push(&scanner->heredocs, new_heredoc);
                heredoc = array_back(&scanner->heredocs);
            }

            memcpy(&heredoc->delimiter.size, &buffer[size], sizeof(uint32_t));
            size += sizeof(uint32_t);
            array_reserve(&heredoc->delimiter, heredoc->delimiter.size);

            if (heredoc->delimiter.size > 0)
            {
                memcpy(heredoc->delimiter.contents, &buffer[size], heredoc->delimiter.size);
                size += heredoc->delimiter.size;
            }
        }
        assert(size == length);
    }
}
