<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\StringValueBinder;

/**
 * One sheet of plain rows. Text is written as strings (StringValueBinder); integers (day counts) as numbers. The fixed 2-decimal figures from
 * `Money` are written as numbers with a `0.00` format, so they can be summed in Excel; a 2-decimal value
 * below 10^13 round-trips exactly through a double at that precision.
 */
class ArraySheet extends StringValueBinder implements FromArray, WithCustomValueBinder, WithTitle
{
    /** @param list<list<scalar|null>> $rows */
    public function __construct(private readonly string $title, private readonly array $rows) {}

    public function bindValue(Cell $cell, mixed $value): bool
    {
        if (is_string($value) && preg_match('/^-?\d{1,13}\.\d{2}$/', $value) === 1) {
            $cell->setValueExplicit($value, DataType::TYPE_NUMERIC);
            $cell->getStyle()->getNumberFormat()->setFormatCode('0.00');

            return true;
        }
        if (is_int($value)) {
            $cell->setValueExplicit($value, DataType::TYPE_NUMERIC);

            return true;
        }

        return parent::bindValue($cell, $value);
    }

    public function title(): string
    {
        return $this->title;
    }

    public function array(): array
    {
        return $this->rows;
    }
}
