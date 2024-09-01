Hello

I apologize in advance for the possible syntax, the text was written in one language, and translated into another through an online translator

This situation happened - I did not quite understand the test task and wrote in the chat to the person who responded to my application, after which I did not receive an answer
My code is a local server that, upon request and json data, perceives what it needs to do
I made the logic, then first it is checked whether the user is in the database, whether he has enough funds and whether there is an asset that the user specified
Then the number of tokens received is calculated at the current price via the Jupiter v6 API, the necessary data is collected, constants in values.json

Since some points were not clear to me, I did it in my understanding
Therefore, the code does not interact with the platform and its table in the database
I made a conditional example, which is based on user data and asset data, positions at the moment are not buffer data, but total data user, which he essentially operates himself almost from the wallet

Also, I made the code working in the main-net through raydium (since I was not aware of whether it was required), because of it there were some inconsistencies in convenience and work
For example, like the appearance of the user accounts themselves in the database and all the necessary parameters for the operation of the real code (rpc, secret key, etc.)

I tried to pay attention to the security of the database, did not do many error checks since the user does not have the ability to interact with the database directly, he is given only an "api interface", which is made only for interaction with existing data

Input data:
- user account in the clients table (I strongly recommend that when testing the source code, fill in the real data of the Solana account, which you will enter in values.js)
- asset in assets (also real token data)

I know that the code is not the best typing and abstraction, but the logic does not require special classes anyway, so I I got by with just one thing - a database, and two separate files with the logic itself on the blockchain

Thank you for your attention and I hope for further cooperation
