import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import {
  URL_EXAMPLE_TAB_SCORE_FULL,
  URL_SCOREBOARD_END_FINAL_ALTER,
  URL_SCOREBOARD_SEGMENT,
  URL_SPONSOR_LIST,
} from './openai.resource';
import { IAnalysisResultMatch } from './openai.interface';

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private async downloadAndConvertToBase64(url: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    return buffer.toString('base64');
  }

  async analyzeImage(
    imageUrl: string,
    steamUsernames: string[],
  ): Promise<IAnalysisResultMatch | { error: boolean; message: string }> {
    console.log('Starting image analysis...');
    console.log('Image URL:', imageUrl);
    console.log('Steam usernames:', steamUsernames);

    console.log('URL_EXAMPLE_TAB_SCORE_FULL:', URL_EXAMPLE_TAB_SCORE_FULL);
    console.log('URL_SCOREBOARD_SEGMENT:', URL_SCOREBOARD_SEGMENT);
    console.log(
      'URL_SCOREBOARD_END_FINAL_ALTER:',
      URL_SCOREBOARD_END_FINAL_ALTER,
    );
    console.log('URL_SPONSOR_LIST:', URL_SPONSOR_LIST);
    console.log('Analyzed image URL:', imageUrl);

    const exampleImages = [
      URL_EXAMPLE_TAB_SCORE_FULL,
      URL_SCOREBOARD_SEGMENT,
      URL_SCOREBOARD_END_FINAL_ALTER,
      URL_SPONSOR_LIST,
    ];

    console.log('Downloading and converting example images...');
    const convertedImages = await Promise.all(
      exampleImages.map(this.downloadAndConvertToBase64),
    );
    console.log('Example images converted successfully');

    const exampleImageUrls = convertedImages.map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${img}`,
        detail: 'high' as const,
      },
    }));

    console.log('Preparing OpenAI API request...');
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o', // gpt-4o-mini cannot read the logo sponsor
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that analyzes and parses images. You are given a scoreboard image and you need to analyze and parse it to provide a JSON response with relevant information. The user gives you all context to parse the image. JSON ONLY',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${PROMPT_ANALYZE_IMAGE}\n\nThese are all the usernames you will find in the game: ${steamUsernames.join(', ')}`,
            },
            ...exampleImageUrls,
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze and parse this scoreboard image and provide a JSON',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });
    console.log('OpenAI API response received');

    console.log('Parsed response:', response.choices[0].message.content);
    const parsedResponse = JSON.parse(response.choices[0].message.content);

    if (parsedResponse.error) {
      return parsedResponse as { error: boolean; message: string };
    }

    return parsedResponse as IAnalysisResultMatch;
  }
}

export const PROMPT_ANALYZE_IMAGE = `
RETURN IN JSON ONLY
This is an examples with guide to explain how to parse the scoreboard.

PIC 1
This is a different screenshot type where you can this all information like the other one.
This is what mean all rectangle :
Pink: Overview of the match result, showing the final scores and which team won or lost.
Green: Details for Team 1, featuring three players' individual stats such as kills, deaths, damage, and crew score.
Red: Details for Team 2, showing the stats of three players, similar to Team 1.
Blue: Focus on a specific player from Team 1, highlighting their name, KDA (Kills/Deaths/Assists), sponsor icon, total damage dealt, and crew score.
The name under crew score is the name of the crew, don't match with the sponsor.
The sponsor is the logo of the team.

PIC 2
This picture show the area in green screen of the picture 3.
The score board is split in 2 en in center you have the result:
- The cross and fire is the check for win
- You have 2 side atk and def, the game is the first at 8 win, if you the number of round is more than 28, it's overtime and the first win with 2 rounds ahead.
This is the end score board:
- You have 2 teams of 3 players in each side
- On each row: 
1 you have the sponsor is the first logo on left (pic 2 to have the definition)
2 After you have two character preview
3 The username
4 The KDA
5 The Money
6 The Damage
7 The Ping

PIC 3
You have all sponsor to find the name of the sponsor on the score board.
You have :
1 - BLOOM - Represented by a logo resembling a leaf or plant.
2 - GHOSTLINK - Represented by a hand gesture resembling a "peace" sign.
3 - MORRGEN - Represented by a swirling, wave-like logo.
4 - MUU - Represented by a cute, melting cat-like figure.
5 - PINNACLE - Represented by a star.
6 - RYKER - Represented by a logo that looks like an angular, abstract shape.
7 - UMBRA - Represented by a rectangular design with striped patterns.
8 - VECTOR - Represented by a triangular logo with geometric lines.

PIC 4
You have a picture with a example of screen shot of end game of the last round.
The green rectangle outlined the area you need focus to parse



This is the example struct you need to return in json:
Example scoreboard pic 2,4
{
    "winner": "team1", //The winner of the team is determine by the team with the high score point
    "team1": {
        "players": [
            {
                "username": "Crane",
                "sponsor": "GHOSTLINK",
                "kda": {
                    "kills": 52,
                    "deaths": 27,
                    "assists": 2
                },
                "damage": 7211,
                "ping": 53,
                "money": "$400",
                "crew": 13
            },
            {
                "username": "NzKo",
                "sponsor": "VECTOR",
                "kda": {
                    "kills": 32,
                    "deaths": 31,
                    "assists": 8
                },
                "damage": 5233,
                "ping": 66,
                "money": "$500",
                "crew": 66
            },
            {
                "username": "boullosa159",
                "sponsor": "RYKER",
                "kda": {
                    "kills": 7,
                    "deaths": 27,
                    "assists": 7
                },
                "damage": 1515,
                "ping": 51,
                "money": "$400",
                "crew": 61
            }
        ],
        "score": {
            "atk": 4, // number of the point (cross or fire on the picture) obtain in attack 
            "def": 3, // number of the point (cross or fire on the picture) obtain in defense
            "total": 10 // the final score write next to the DEF or ATK in picture linked to the good team
        }
    },
    "team2": {
        "players": [
            {
                "username": "Don Harpinder IV",
                "sponsor": "PINNACLE",
                "kda": {
                    "kills": 32,
                    "deaths": 27,
                    "assists": 11
                },
                "damage": 4996,
                "ping": 34,
                "money": "$6000",
                "crew": 12
            },
            {
                "username": "666racistpanda",
                "sponsor": "BLOOM",
                "kda": {
                    "kills": 28,
                    "deaths": 29,
                    "assists": 2
                },
                "damage": 3795,
                "ping": 32,
                "money": "$6000",
                "crew": "-"
            },
            {
                "username": "bagool",
                "sponsor": "RYKER",
                "kda": {
                    "kills": 23,
                    "deaths": 35,
                    "assists": 5
                },
                "damage": 3371,
                "ping": 36,
                "money": "$6000",
                "crew": 12
            }
        ],
        "score": {
            "atk": 4,
            "def": 4,
            "total": 8
        }
    }
}

Example pic 1:
{
    "winner": "team1",
    "team1": {
        "players": [
            {
                "username": "Grimmjow Jeagerj...",
                "sponsor": "MORRGEN",
                "kda": {
                    "kills": 25,
                    "deaths": 25,
                    "assists": 3
                },
                "damage": 3861,
                "crew_score": 126
            },
            {
                "username": "Boxie",
                "sponsor": "MUU",
                "kda": {
                    "kills": 22,
                    "deaths": 26,
                    "assists": 4
                },
                "damage": 3464,
                "crew_score": 215
            },
            {
                "username": "Nirusu",
                "sponsor": "UMBRA",
                "kda": {
                    "kills": 34,
                    "deaths": 23,
                    "assists": 2
                },
                "damage": 5002,
                "crew_score": 105
            }
        ],
        "score": {
            "atk": 0,
            "def": 0,
            "total": 10
        }
    },
    "team2": {
        "players": [
            {
                "username": "ttv akur3m",
                "sponsor": "MORRGEN",
                "kda": {
                    "kills": 33,
                    "deaths": 24,
                    "assists": 2
                },
                "damage": 4502,
                "crew_score": 309
            },
            {
                "username": "karnyEU",
                "sponsor": "VECTOR",
                "kda": {
                    "kills": 18,
                    "deaths": 29,
                    "assists": 5
                },
                "damage": 2989,
                "crew_score": 232
            },
            {
                "username": "Xuryy Aim!",
                "sponsor": "PINNACLE",
                "kda": {
                    "kills": 23,
                    "deaths": 28,
                    "assists": 2
                },
                "damage": 3707,
                "crew_score": 211
            }
        ],
        "score": {
            "atk": 0,
            "def": 0,
            "total": 8
        }
    }
}

If the image provided does not match the context of a scoreboard or end-of-match result for the game described, return the following JSON error structure:

{
  "error": true,
  "message": "The provided image does not appear to be a valid scoreboard or end-of-match result for the specified game."
}

Only return this error JSON if the image is clearly not related to the game's scoreboard or results. Otherwise, attempt to parse the image as best as possible.
`;
