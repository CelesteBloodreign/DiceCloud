import SimpleSchema from 'simpl-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties.js';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions.js';
import { groupBy, remove, rest, union } from 'lodash';
import {
  getCreature, getVariables, getPropertiesOfType
} from '/imports/api/engine/loadCreatures.js';
import { CreatureLogSchema, insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs.js';
import { applyTrigger } from '/imports/api/engine/actions/applyTriggers.js';

const restCreature = new ValidatedMethod({
  name: 'creature.methods.rest',
  validate: new SimpleSchema({
    creatureId: {
      type: String,
      regEx: SimpleSchema.RegEx.Id,
    },
    restType: {
      type: String,
      allowedValues: ['shortRest', 'longRest'],
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  run({creatureId, restType}) {
    // Check permissions
    let creature = getCreature(creatureId);
    assertEditPermission(creature, this.userId);

    // Add the variables to the creature document
    const variables = getVariables(creatureId);
    delete variables._id;
    delete variables._creatureId;
    creature.variables = variables;
    const scope = creature.variables;

    // Get the triggers
    let triggers = getPropertiesOfType(creatureId, 'trigger');
    remove(triggers, trigger =>
      trigger.event !== 'anyRest' &&
      trigger.event !== 'longRest' &&
      trigger.event !== 'shortRest'
    );
    triggers = groupBy(triggers, 'event');
    for (let type in triggers) {
      triggers[type] = groupBy(triggers[type], 'timing')
    }

    // Create the log
    const log = CreatureLogSchema.clean({
      creatureId: creature._id,
      creatureName: creature.name,
    });

    const targets = [creature];

    applyTriggers(triggers, restType, 'before', { creature, targets, scope, log });
    doRestWork(creature, restType);
    applyTriggers(triggers, restType, 'after', { creature, targets, scope, log });

    insertCreatureLogWork({log, creature, method: this});
  },
});

function applyTriggers(triggers, restType, timing, opts) {
  // Get matching triggers
  let selectedTriggers = triggers[restType]?.[timing] || [];
  // Get any rest triggers as well
  selectedTriggers = union(selectedTriggers, triggers['anyRest']?.[timing]);
  selectedTriggers.sort((a, b) => a.order - b.order);
  // Apply the triggers
  selectedTriggers.forEach(trigger => {
    applyTrigger(trigger, opts)
  });
}

function doRestWork(creature, restType) {
  // Long rests reset short rest properties as well
  let resetFilter;
  if (restType === 'shortRest'){
    resetFilter = 'shortRest'
  } else {
    resetFilter = {$in: ['shortRest', 'longRest']}
  }
  // Only apply to active properties
  let filter = {
    'ancestors.id': creature._id,
    reset: resetFilter,
    removed: { $ne: true },
    inactive: { $ne: true },
  };
  // update all attribute's damage
  filter.type = 'attribute';
  CreatureProperties.update(filter, {
    $set: {
      damage: 0,
      dirty: true,
    }
  }, {
    selector: {type: 'attribute'},
    multi: true,
  });
  // Update all action-like properties' usesUsed
  filter.type = {$in: [
    'action',
    'attack',
    'spell'
  ]};
  CreatureProperties.update(filter, {
    $set: {
      usesUsed: 0,
      dirty: true,
    }
  }, {
    selector: {type: 'action'},
    multi: true,
  });
  // Reset half hit dice on a long rest, starting with the highest dice
  if (restType === 'longRest'){
    let hitDice = CreatureProperties.find({
      'ancestors.id': creature._id,
      type: 'attribute',
      attributeType: 'hitDice',
      removed: {$ne: true},
      inactive: {$ne: true},
    }, {
      fields: {
        hitDiceSize: 1,
        damage: 1,
        value: 1,
      }
    }).fetch();
    // Use a collator to do sorting in natural order
    let collator = new Intl.Collator('en', {
      numeric: true, sensitivity: 'base'
    });
    // Get the hit dice in decending order of hitDiceSize
    let compare = (a, b) => collator.compare(b.hitDiceSize, a.hitDiceSize)
    hitDice.sort(compare);
    // Get the total number of hit dice that can be recovered this rest
    let totalHd = hitDice.reduce((sum, hd) => sum + (hd.value || 0), 0);
    let resetMultiplier = creature.settings.hitDiceResetMultiplier || 0.5;
    let recoverableHd = Math.max(Math.floor(totalHd*resetMultiplier), 1);
    // recover each hit dice in turn until the recoverable amount is used up
    let amountToRecover, resultingDamage;
    hitDice.forEach(hd => {
      if (!recoverableHd) return;
      amountToRecover = Math.min(recoverableHd, hd.damage || 0);
      if (!amountToRecover) return;
      recoverableHd -= amountToRecover;
      resultingDamage = hd.damage - amountToRecover;
      CreatureProperties.update(hd._id, {
        $set: {
          damage: resultingDamage,
          dirty: true,
        }
      }, {
        selector: {type: 'attribute'},
      });
    });
  }
}

export default restCreature;
