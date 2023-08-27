const firebaseDatabaseURL = "https://multiplayer-demo-2f287-default-rtdb.firebaseio.com";
const playersPath = "lobby.json"; // Path to players data
const gamesPath = "games.json"; // Path to games data

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkPlayersAndCreateRoom = async () => {
    while (true) {
        try {
            const response = await fetch(`${firebaseDatabaseURL}/${playersPath}`);
            const data = await response.json();
            // Filter out objects where gameId is not "null"
            const filteredData = filterPlayersByGameId(data);

            if (areAllPlayersReady(filteredData)) {
                createRoom(filteredData);
                //break; // Exit the loop once a room is created
                await delay(10000);
            } else {
                console.log("Not all players are ready. Waiting...");
            }

            await delay(5000); // Wait for 1 second before checking again
        } catch (error) {
            console.error("Error reading data:", error);
            await delay(5000); // Wait for 1 second before retrying after an error
        }
    }
};

// Function to filter out objects where gameId is not "null"
const filterPlayersByGameId = (players) => {
    const filteredData = {};

  for (const outerKey in players) {
    if (Object.hasOwnProperty.call(players, outerKey)) {
      filteredData[outerKey] = {};
      for (const innerKey in players[outerKey]) {
        if (
          Object.hasOwnProperty.call(players[outerKey], innerKey) &&
          players[outerKey][innerKey].gameId === 'null'
        ) {
          filteredData[outerKey][innerKey] = players[outerKey][innerKey];
        }
      }
      // Check if the outer object has any inner objects left
      if (Object.keys(filteredData[outerKey]).length === 0) {
        delete filteredData[outerKey];
      }
    }
  }

  return filteredData;
};

// Function to check if all players are ready
const areAllPlayersReady = (players) => {
    const result = {};
    console.log(players)
    for (const key in players) {
        if (Object.hasOwnProperty.call(players, key)) {
            // Get the inner object
            const innerObject = players[key][Object.keys(players[key])[0]];

            // Add the inner object to the result with the top-level key
            result[key] = innerObject;
        }
    }
    console.log(result)
    if (Object.keys(result).length < 2) {
        console.log("Not enough players in lobby to start a game.")
        return false;
    }
    console.log(result)
    return Object.values(result).every((player) => player.isReady == true);
};

const createRoom = (currentPlayers) => {
    // Your existing createRoom function goes here...
    const result = {};
    const currentPlayersDoubleNested = currentPlayers;
    // Loop through the top-level objects
    for (const key in currentPlayers) {
        if (Object.hasOwnProperty.call(currentPlayers, key)) {
            // Get the inner object
            const innerObject = currentPlayers[key][Object.keys(currentPlayers[key])[0]];

            // Add the inner object to the result with the top-level key
            result[key] = innerObject;
        }
    }
    currentPlayers = result;

    const gameObject = {
        players: currentPlayers,
        gameState: {
            gameReady: false,
            coins: []
        }
    }
    fetch(`${firebaseDatabaseURL}/games.json`, {
        method: "POST",
        body: JSON.stringify(gameObject),
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((response) => response.json())
        .then((data) => { // Game Id created
            console.log("Data written successfully:", data);
            //console.log(currentPlayers);
            for (const key in currentPlayers) {
                if (currentPlayers[key].hasOwnProperty("gameId")) {
                    currentPlayers[key].gameId = data.name;
                }
            }
            for (const key in currentPlayersDoubleNested) {
                for (const innerKey in currentPlayersDoubleNested[key]) {
                    if (currentPlayersDoubleNested[key][innerKey].hasOwnProperty("gameId")) {
                        currentPlayersDoubleNested[key][innerKey].gameId = data.name;
                    }
                }
            }

            const gameId = data.name
            console.log(currentPlayers)
            fetch(`${firebaseDatabaseURL}/games/${gameId}/players.json`, {
                method: "POST",
                body: JSON.stringify(currentPlayers),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((response) => {
                if (!response.ok) {
                    console.log(response)
                    throw new Error('Network response was not ok');
                }
                return response.json(); // Parse the response JSON if applicable
            })
                .then((data) => {
                    // Handle the response data
                    console.log('Data updated:', data);
                    console.log('Game id:', gameId);

                    fetch(`${firebaseDatabaseURL}/games/${gameId}/players/${data.name}.json`, {
                        method: "Delete",
                    }).then((response) => {
                        console.log(response)
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                        console.log("delete successful")
                    })
                })
                .catch((error) => {
                    // Handle errors
                    console.error('Fetch error:', error);
                });

            fetch(`${firebaseDatabaseURL}/lobby.json`, {
                method: "PUT",
                body: JSON.stringify(currentPlayersDoubleNested),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((response) => {
                if (!response.ok) {
                    console.log(response)
                    throw new Error('Network response was not ok');
                }
                return response.json(); // Parse the response JSON if applicable
            })
                .then((data) => {
                    // Handle the response data
                    console.log('Data updated:', data);
                })
                .catch((error) => {
                    // Handle errors
                    console.error('Fetch error:', error);
                });

        })
        .catch((error) => {
            console.error("Error writing data:", error);
        });
};

checkPlayersAndCreateRoom();
