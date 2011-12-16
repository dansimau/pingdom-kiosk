<?
define('SERVER_URL', 'https://ws.pingdom.com/soap/PingdomAPI.wsdl');
define('PINGDOM_API_STATUS_OK', 0);

class Pingdom {

	private $username;
	private $password;
	private $api_key;

	private $session_id;
	private $soap_client;

	public $num_checks = -1;

	public function __construct($username, $password, $api_key) {

		$this->username = $username;
		$this->password = $password;
		$this->api_key = $api_key;

		$this->soap_client = new SoapClient(
			SERVER_URL,
			array(
				'trace' => 1,
				'exceptions' => 1,
				'connection_timeout' => 10
			)
		);
	}

	/**
	 * Connects to Pingdom API and starts a session.
	 */
	public function connect() {
	
		$login_data->username = $this->username;
		$login_data->password = $this->password;
		
		$login_response = $this->soap_client->Auth_login($this->api_key, $login_data);

		if (PINGDOM_API_STATUS_OK != $login_response->status) {
			throw new Exception("Unable to login. Pingdom returned code " . $login_response->status);
			return false;
		}
		
		$this->session_id = $login_response->sessionId;
		return true;
	}

	/**
	 * Ends session with Pingdom.
	 */
	public function disconnect() {
		$logout_response = $this->soap_client->Auth_logout($this->api_key, $this->session_id);
	}

	/**
	 * Gets a list of the checks that are currently in a given state.
	 */
	public function get_check_states($check_state_filter = "") {
	
		$api_response = $this->soap_client->Report_getCurrentStates($this->api_key, $this->session_id);
	
		if (PINGDOM_API_STATUS_OK != $api_response->status) {
			throw new Exception('Error occurred while trying to get list of statuses for your checks.', $api_response->status);
			return Array();
		}
	
		$list_of_states = $api_response->currentStates;
		$this->num_checks = count($list_of_states);

		$check_states = Array();
	
		foreach ($list_of_states as $check_state) {

			if (!empty($check_state_filter) && ($check_state->checkState != $check_state_filter)) {
				continue;
			} else {
				$check_states[] = $check_state;
			}
		}
	
		return $check_states;
	}
}

?>
