<?php

/*
| Each feature owns exactly one file in routes/api/*.php. They are loaded in
| alphabetical order. Do not add routes here; add a file in routes/api/.
*/

foreach (glob(__DIR__.'/api/*.php') as $file) {
    require $file;
}
