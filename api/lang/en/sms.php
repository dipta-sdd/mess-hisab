<?php

// One amount per text, plain ASCII, so each stays a single SMS segment.
return [
    'payment_received' => ':amount payment received on :date. Thank you.',
    'payment_changed' => 'Your :date payment was changed to :amount.',
    'payment_changed_date' => 'Your :old_date payment was changed to :amount on :date.',
    'payment_cancelled' => 'Your :amount payment of :date was cancelled.',
    'month_owes' => ':month closed. You need to pay :amount.',
    'month_credit' => ':month closed. You will get back :amount.',
    'month_settled' => ':month closed. Nothing to pay or receive.',
];
