#!/usr/bin/env bash
in="$1"
out="${in%.md}.pdf"

MERMAID_FILTER_FORMAT=png pandoc "$in" -o "$out" --pdf-engine=weasyprint -c style.css -F mermaid-filter