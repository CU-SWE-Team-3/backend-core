// src/validations/playlistValidation.js

const playlistIdParamSchema = {
  params: {
    id: {
      required: true,
      type: 'mongoId',
      typeMessage: 'Invalid playlist ID format',
    },
  },
};

const createPlaylistSchema = {
  body: {
    title: {
      required: true,
      requiredMessage: 'Playlist title is required',
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Title cannot exceed 100 characters',
    },
    description: {
      type: 'string',
      maxLength: 1000,
      maxLengthMessage: 'Description cannot exceed 1000 characters',
    },
    releaseType: {
      type: 'string',
      enum: ['playlist', 'album', 'ep', 'single'],
      enumMessage:
        'Invalid release type. Must be playlist, album, ep, or single',
    },
    tags: {
      type: 'array',
      itemType: 'string',
      itemTypeMessage: 'All tags must be strings',
      maxItems: 30,
      maxItemsMessage: 'A playlist cannot exceed 30 tags',
    },
    genre: {
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'Genre cannot exceed 50 characters',
    },
    releaseDate: {
      type: 'string',
      typeMessage: 'Release date must be a string',
    },
    labelName: {
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Label name cannot exceed 100 characters',
    },
    buyLink: {
      type: 'string',
      maxLength: 500,
      maxLengthMessage: 'Buy link cannot exceed 500 characters',
    },
    buyTitle: {
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Buy title cannot exceed 100 characters',
    },
    // 👇 NEW: UPC validation
    upc: {
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'UPC cannot exceed 50 characters',
    },
    isPrivate: {
      type: 'boolean',
      typeMessage: 'isPrivate must be a boolean',
    },
    artworkUrl: {
      type: 'string',
      typeMessage: 'Artwork URL must be a string',
    },
    tracks: {
      type: 'array',
      itemType: 'mongoId',
      itemTypeMessage: 'All track IDs must be valid Mongo IDs',
      maxItems: 500,
      maxItemsMessage: 'A playlist cannot exceed 500 tracks',
    },
  },
};

const updatePlaylistSchema = {
  params: playlistIdParamSchema.params,
  body: {
    title: {
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Title cannot exceed 100 characters',
    },
    description: {
      type: 'string',
      maxLength: 1000,
      maxLengthMessage: 'Description cannot exceed 1000 characters',
    },
    releaseType: {
      type: 'string',
      enum: ['playlist', 'album', 'ep', 'single'],
      enumMessage:
        'Invalid release type. Must be playlist, album, ep, or single',
    },
    tags: {
      type: 'array',
      itemType: 'string',
      itemTypeMessage: 'All tags must be strings',
      maxItems: 30,
      maxItemsMessage: 'A playlist cannot exceed 30 tags',
    },
    genre: {
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'Genre cannot exceed 50 characters',
    },
    releaseDate: {
      type: 'string',
      typeMessage: 'Release date must be a string',
    },
    labelName: {
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Label name cannot exceed 100 characters',
    },
    buyLink: {
      type: 'string',
      maxLength: 500,
      maxLengthMessage: 'Buy link cannot exceed 500 characters',
    },
    buyTitle: {
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Buy title cannot exceed 100 characters',
    },
    // 👇 NEW: UPC validation for updates
    upc: {
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'UPC cannot exceed 50 characters',
    },
    isPrivate: {
      type: 'boolean',
      typeMessage: 'isPrivate must be a boolean',
    },
    artworkUrl: {
      type: 'string',
      typeMessage: 'Artwork URL must be a string',
    },
  },
};

const updateTracksSchema = {
  params: playlistIdParamSchema.params,
  body: {
    tracks: {
      required: true,
      requiredMessage:
        'An array of track IDs is required to update the sequence',
      type: 'array',
      itemType: 'mongoId',
      itemTypeMessage: 'All track IDs must be valid Mongo IDs',
      maxItems: 500,
      maxItemsMessage: 'A playlist cannot exceed 500 tracks',
    },
  },
};

module.exports = {
  playlistIdParamSchema,
  createPlaylistSchema,
  updatePlaylistSchema,
  updateTracksSchema,
};
