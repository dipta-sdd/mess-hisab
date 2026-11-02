<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\Export as ExportConcern;
use Maatwebsite\Excel\Concerns\Exportable;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

class ExportWorkbook implements ExportConcern, WithMultipleSheets
{
    use Exportable;

    /** @param list<ArraySheet> $sheets */
    public function __construct(private readonly array $sheets) {}

    public function sheets(): array
    {
        return $this->sheets;
    }
}
