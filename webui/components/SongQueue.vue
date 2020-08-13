<template>
  <v-data-table :headers="headers" :items="queueData" search>

  </v-data-table>
</template>

<script>
import * as format from 'format-duration';
export default {
  props: ['queueData'],
  data: function() {
    return {
      headers: [
        {text: 'Queue Position', value: 'pos'},
        {text: 'Song Name', value: 'name'},
        {text: 'Duration', value: 'dur'},
        {text: 'Requester', value: 'requester'},
        {text: 'Actions', sortable: false, value: 'actions'},
      ],
    };
  },
};

</script>
