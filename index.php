<?
/*
 * Frontend Pingdom status script. Reads cached data from the pollers and
 * displays a list of sites that are down, or "OK" if none are down.
 *
 * 2009-07-23
 * dsimmons@squiz.co.uk
 */

require "config.inc";
require "classes/datastore.php";

$errors = array();
$num_checks = 0;

try {
	// Init and read cache
	$cache = new DataStore("data");

	foreach ($pingdom_accounts as $pingdom_account) {
	
		$data = $cache->get_item($pingdom_account['api_key']);

		// Check if there is an include whitelist for this pingdom config and filter out
		// this check if it isn't in the whitelist
		if (!empty($pingdom_account['include'])) {
			foreach ($data->errors as $error) {
				if (in_array($error->checkName, $pingdom_account['include'])) {
					$errors[] = $error;
				}
			}

			// Only increment num_checks with the number of checks in the whitelist
			$num_checks = $num_checks + count($pingdom_account['include']);

		} else {

			// Just add all checks together
			$errors = array_merge($errors, $data->errors);

			// Otherwise, count ALL the checks from Pingdom
			$num_checks = $num_checks + $data->num_checks;
		}
	
		if ((time() - 300) > $data->timestamp) {
			// Cache data is more than 5 minutes old
			$errors = -1;
		}
	}

} catch (Exception $e) {

	// Can't read cache file
	$errors = -1;
}

// Counts how many ignored checks are down
$ignored_down = 0;

$now = time();
for ($i = 0; $i < count($errors); $i++) {

	// Remove ignored checks from the error list
	if (in_array($errors[$i]->checkName, $ignore_checks)) {
		$ignored_down++;
		unset($errors[$i]);
		$errors = array_values($errors);
		$i--;
		continue;
	}

	// Calculate down time for each error
	$errors[$i]->downTime = round(($now - $errors[$i]->downSince) / 60);

	if ($errors[$i]->downTime >= 0 && $errors[$i]->downTime <= 2) {

		// Delay displaying down events to reduce false positives
		unset($errors[$i]);
		$errors = array_values($errors);
		$i--;
		continue;

	} else if ($errors[$i]->downTime >= 0 && $errors[$i]->downTime < 60) {
		$errors[$i]->downTime = "(" . $errors[$i]->downTime ." minutes)";
	} else if ($errors[$i]->downTime > 60 && $errors[$i]->downTime < 120) {
		$errors[$i]->downTime = round($errors[$i]->downTime / 60);
		$errors[$i]->downTime = "(" . $errors[$i]->downTime ." hour)";
	} else if ($errors[$i]->downTime > 120 && $errors[$i]->downTime < 86400) {
		$errors[$i]->downTime = round($errors[$i]->downTime / 60);
		$errors[$i]->downTime = "(" . $errors[$i]->downTime ." hours)";
	} else {
		$errors[$i]->downTime = "";
	}
}

$output = "";

// Print HTML head
$output .= "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\">";
$output .= "<html xmlns=\"http://www.w3.org/1999/xhtml\">";
$output .= "<head>";
$output .= "<title>Pingdom Status Check</title>";
$output .= "<link rel=\"stylesheet\" type=\"text/css\" href=\"res/default.css\" media=\"screen\" />";

// If OK, refresh every 10 seconds. If error, refresh every 60 seconds (to prevent annoying beeping)
if (empty($errors)) {
	$output .= "<meta http-equiv=\"refresh\" content=\"10\" />";
} else {
	$output .= "<meta http-equiv=\"refresh\" content=\"60\" />";
}

$output .= "<style>";

// Print different background colour depending on service status
if (empty($errors)) {
	$output .= "body { background-color: green; }";
} else {
	if ($errors == -1) {
		// Poller is down
		$output .= "body { background-color: #FF9900; }";
	} else {
		// Normal site errors
		$output .= "body { background-color: red; }";
	}
}

// Here we resize the text depending on how many alerts there are. We can only
// fit a certain number of site names on the TV screen at once.
switch (count($errors)) {

	case 0:
		$output .= "ul { padding-top: 50px; } li { padding-bottom: 10px; font-size: 20px; } .downTimeLengthDisplay { display: none; }";
		break;
		
	case 1:
		$output .= "li { padding-top: 80px; font-size: 140px; }\n.downTimeLengthDisplay { font-size: 38px; }";
		break;

	case 2:
		$output .= "ul { padding-top: 50px; } li { text-decoration: none; font-size: 105px; }\n.downTimeLengthDisplay { font-size: 28px; line-height: 5px; }";
		break;

	case 3:
		$output .= "ul { padding-top: 50px; } li { text-decoration: none; padding-bottom: 30px; font-size: 80px; }\n.downTimeLengthDisplay { font-size: 28px; line-height: 2px; }";
		break;

	case 4:
		$output .= "h1 { text-decoration: blink; } ul { padding-top: 70px; } li { padding-bottom: 20px; font-size: 60px; }\n.downTimeLengthDisplay { font-size: 18px; line-height: 0px; }";
		break;

	case 5:
	case 6:
		$output .= "h1 { text-decoration: blink; } ul { padding-top: 50px; } li { text-decoration: none; padding-bottom: 20px; font-size: 50px; } .downTimeLengthDisplay { font-size: 18px; line-height: 0px; }";
		break;

	default:
		$output .= "h1 { font-size: 110px; text-decoration: blink; } ul { padding-top: 50px; } li { padding-bottom: 10px; font-size: 20px; } .downTimeLengthDisplay { display: none; }";

}

$output .= "</style>";
$output .= "</head>";
$output .= "<body>";

// Print last updated date
$output .= "<p class=\"updated\">" . date("d F Y, H:i T", $data->timestamp) . "</p>";

// Print header depending on errors or not
if ($errors == -1) {
	// Poller is down
	$output .= "<p>There is a problem with the monitoring system.</p>";
	$output .= "<p>Check that the background Pingdom poller is up and able to connect to Pingdom, and that the local cache data file is readable/writeable.</p>";

} elseif (empty($errors)) {
	$output .= "<h1>Hosting service status</h1>";

} else {

	$output .= "<object type=\"audio/x-wav\" data=\"res/beep.wav\" width=\"0\" height=\"0\">";
	$output .= "<param name=\"src\" value=\"res/beep.wav\">";
	$output .= "</object>";

	if (count($errors) > 3) {
		$output .= "<h1>" . count($errors) . " sites down!</h1>";
	} else {
		$output .= "<h1>Down</h1>";
	}
}

// Body
if ($errors == -1) {
	$output .= "<p style=\"font-size: 180px; font-weight: bold;\">fail</p>";

} elseif (empty($errors)) {

	$output .= "<p style=\"font-size: 180px; font-weight: bold;\">OK</p>";

	// Print number of ignored checks being down
	if ($ignored_down > 1) {
		$output .= "<p style=\"font-size: 40px; position: absolute; top: 540px; left: 170px; background: orange; padding: 10px;\">But " . $ignored_down . " ignored checks are still down.</p>";
	} elseif ($ignored_down == 1) {
		$output .= "<p style=\"font-size: 40px; position: absolute; top: 540px; left: 190px; background: orange; padding: 10px;\">But 1 ignored check is still down.</p>";
	}

	$output .= "<p style=\"font-size: 30px;\">";

	# Print stats on the number of checks (if available)
	if (!empty($num_checks)) {
		$output .= "Monitoring " . $num_checks . " sites. ";
	}

	if (count($ignore_checks) > 0) {
		$output .= "<span style=\"color: #660000;\">" . count($ignore_checks) . " ignored.</span> ";
	}

	$output .= "</p>";
		

// Otherwise...
} else {

	// Find out how to group the list of sites that are down. If there's more than
	// 15, we'll group them into two columns.
	if (count($errors) < 15) {

		# Standard grouping (single list)
		$output .= "<ul>";
		foreach ($errors as $error) {
		
				$output .= "<li>";
				$output .= $error->checkName;
				
				$output .= "<p class=\"downTimeLengthDisplay\">" . $error->downTime . "</p>";
					
				$output .= "</li>";
		}
		$output .= "</ul>";

	// Two-column listing for more than 15 site names
	} elseif (count($errors) > 14 && count($errors) < 31) {

		$c=1;
		$output .= "<ul style=\"float: left; margin-left: 80px;\">";

		# Divide the columns in half
		$half = round(count($errors) / 2) + 1;

		foreach ($errors as $error) {
			if ($c == $half) {
				$output .= "</ul><ul style=\"float: left; margin-left: 80px;\">";
			}
			$output .= "<li>" . $error->checkName . "</li>";
			$c++;
		}
		$output .= "</ul>";

	// If there's more than 30 down, just print some profanity. No-one should
	// actually be reading the list at this point.
	} else {
		$output .= "<p style=\"font-size: 180px; padding-top: 10px;\">Sh#@!t !!</p>";
	}
}

$output .= "</body>";
$output .= "</html>";

// Print buffer to the page
echo $output;
flush();

?>
