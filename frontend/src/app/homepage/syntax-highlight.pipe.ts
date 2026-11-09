import { Pipe, PipeTransform } from '@angular/core';
import type { ElementContent, RootContent } from 'hast';
import { refractor } from 'refractor/core';
import javascript from 'refractor/javascript';
import python from 'refractor/python';
import sql from 'refractor/sql';

refractor.register(javascript);
refractor.register(python);
refractor.register(sql);

interface CodeToken {
  text: string;
  kind: string;
}

// Render the highlighted code as text to keep markup inert.
@Pipe({ name: 'syntaxHighlight' })
export class SyntaxHighlightPipe implements PipeTransform {
  transform(code: string, language: string): CodeToken[] {
    const name = language.toLowerCase();
    if (!refractor.registered(name)) return [{ text: code, kind: 'plain' }];

    const result: CodeToken[] = [];
    const append = (nodes: (RootContent | ElementContent)[], inherited = 'plain'): void => {
      for (const node of nodes) {
        if (node.type === 'text') {
          result.push({ text: node.value, kind: inherited });
        } else if (node.type === 'element') {
          const classes = node.properties.className;
          const kind = Array.isArray(classes)
            ? classes.find((value) => typeof value === 'string' && value !== 'token')
            : undefined;
          append(node.children, typeof kind === 'string' ? kind : inherited);
        }
      }
    };
    append(refractor.highlight(code, name).children);
    return result;
  }
}
