import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import SimpleSchema from 'simpl-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertOwnership } from '/imports/api/creature/creatures/creaturePermissions';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

export function getArchiveObj(creatureId) {
  // Build the archive document
  const creature = Creatures.findOne(creatureId);
  const properties = CreatureProperties.find({ ...getFilter.descendantsOfRoot(creatureId) }).fetch();
  const experiences = Experiences.find({ creatureId }).fetch();
  const logs = CreatureLogs.find({ creatureId }).fetch();
  let archiveCreature = {
    meta: {
      type: 'DiceCloud V2 Creature Archive',
      schemaVersion: SCHEMA_VERSION,
      archiveDate: new Date(),
    },
    creature,
    properties,
    experiences,
    logs,
  };

  return archiveCreature;
}

export function archiveCreature(creatureId) {
  const archive = getArchiveObj(creatureId);
  const buffer = Buffer.from(JSON.stringify(archive, null, 2));
  ArchiveCreatureFiles.write(buffer, {
    fileName: `${archive.creature.name || archive.creature._id}.json`,
    type: 'application/json',
    userId: archive.creature.owner,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      creatureId: archive.creature._id,
      creatureName: archive.creature.name,
    },
  }, (error) => {
    if (error) {
      throw error;
    } else {
      removeCreatureWork(creatureId);
    }
  }, true);
}

const archiveCreatureToFile = new ValidatedMethod({
  name: 'Creatures.methods.archiveCreatureToFile',
  validate: new SimpleSchema({
    'creatureId': {
      type: String,
      regEx: SimpleSchema.RegEx.Id,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ creatureId }) {
    assertOwnership(creatureId, this.userId);
    if (Meteor.isServer) {
      archiveCreature(creatureId);
    } else {
      removeCreatureWork(creatureId);
    }
  },
});

export default archiveCreatureToFile;
