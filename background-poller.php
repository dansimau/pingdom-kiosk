#!/usr/bin/php
<?
require "config.inc";
require "classes/datastore.php";
require "classes/pingdom.php";

declare(ticks = 1);
pcntl_signal(SIGCHLD , "reap");

$process_name = 'master process';

log_message("Init.", 2);

$pids = Array();

foreach ($pingdom_accounts as $pingdom_account) {

	$pid = pcntl_fork();

	if ($pid == -1) {
		die('could not fork');

	} else if ($pid == 0) {

		$process_name = 'pingdom poller: ' . $pingdom_account['username'] . '/' . $pingdom_account['api_key'];

		if (function_exists('setproctitle')) {
			setproctitle($process_name);
		}

		$cache = new DataStore(dirname($_SERVER['PHP_SELF']) . "/data");
		$pingdom = new Pingdom($pingdom_account['username'], $pingdom_account['password'], $pingdom_account['api_key']);
		
		if (!connect()) {
			log_message("Initial login failed. Exiting.", 0);
			exit(1);
		}
		
		log_message("Beginning polling.", 2);
		
		while (1) {
		
			try {
				// Get the errors
				log_message("Getting check states.", 3);
				$data->errors = $pingdom->get_check_states('CHECK_DOWN');
			}
			catch (Exception $e) {
		
				log_message("Failed with error code " . @$e->getCode . ". Attempting to reconnect.", 1);
				try {
					$pingdom->disconnect();
				}
				catch (Exception $e) {}
		
				if (connect()) {
					continue;
				} else {
					log_message("Reconnection failed. Retry in 10 seconds.", 2);
					sleep(10);
					continue;
				}
			}
		
		
			if (count($data->errors) > 0) {
				log_message(count($data->errors) . " check errors.", 3);
			}
			
			// Open the locally cached data
			log_message("Reading cache data.", 4);
			$stored_data = $cache->get_item($pingdom_account['api_key']);
		
			for ($i = 0; $i < count($data->errors); $i++) {
			
				// Was this site down last time we checked?
				for ($j = 0; $j < count($stored_data->errors); $j++) {
				
					if (($data->errors[$i]->checkName == $stored_data->errors[$j]->checkName) && isset($stored_data->errors[$j]->downSince)) {
		
						log_message("Site was down last check. Has been down since " . $stored_data->errors[$i]->downSince . ".", 4);
						$data->errors[$i]->downSince = $stored_data->errors[$j]->downSince;
		
						break;
					}
				}
		
				if (!isset($data->errors[$i]->downSince)) {
					log_message("This check was not down last time. Adding down timestamp to data.", 4);
					$data->errors[$i]->downSince = time();
				}			
			}
		
			unset($stored_data);
		
			$data->num_checks = $pingdom->num_checks;
			$data->timestamp = time();
		
			// Store this stuff to cache
			log_message("Updating local cache file " . $cache->datadir . "/" . $pingdom_account['api_key'], 3);
		
			$cache->put_item($pingdom_account['api_key'], $data);
		
			log_message("Sleeping.", 3);
			sleep(10);
		}
	} else {
		$pids[] = $pid;
	}
}

pcntl_signal(SIGINT, "cleanup");
pcntl_signal(SIGQUIT, "cleanup");
pcntl_signal(SIGTERM, "cleanup");

while (1) {
	sleep(60);
}

/**
 * Writes log messages to wherever. Log levels:
 *  0 = Error (fatal)
 *  1 = Warning
 *  2 = Information (default)
 *  3 = Verbose
 *  4 = Debug
 */
function log_message($message, $level = 2) {

	global $process_name;

	if ($level > LOG_LEVEL) return;

	$output = date("r") . " [" . $level . "][" . $process_name . "]: " . $message . "\n";

	if ($level > 1) {
		fwrite(STDOUT, $output);
	} else {
		fwrite(STDERR, $output);
	}
}

function connect() {

	global $pingdom;
	log_message("Connecting to Pingdom.", 2);

	try {
		$pingdom->connect();
	}
	catch (Exception $e) {
		log_message("Connection failed: [" . $e->getCode() . "]: " . $e->getMessage());
		return false;
	}

	return true;
}

function reap() {
	$p = pcntl_waitpid(-1, $status, WNOHANG);
	log_message("Child " . $p . " exited.", 2);
}

function cleanup($signal) {

	global $pids;
	foreach ($pids as $pid) {
		posix_kill($pid, SIGTERM);
	}

	log_message("Bye.", 2);
	exit;
}
?>
