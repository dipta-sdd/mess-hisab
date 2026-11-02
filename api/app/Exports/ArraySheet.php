<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Cell\StringValueBinder;

/**
 * One sheet of plain rows. Every value is written as a string (StringValueBinder), so the 2-decimal taka
 * figures are stored exactly as formatted and never pass through a float.
 */
class ArraySheet extends StringValueBinder implements FromArray, WithCustomValueBinder, WithTitle
{
    /** @param list<list<scalar|null>> $rows */
    public function __construct(private readonly string $title, private readonly array $rows) {}

    public function title(): string
    {
        return $this->title;
    }

    public function array(): array
    {
        return $this->rows;
    }
}
