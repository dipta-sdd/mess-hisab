<?php

namespace App\Services\Sms;

use RuntimeException;

/** The SMS gateway did not accept the message. Never carries the API key. */
class SmsFailed extends RuntimeException {}
