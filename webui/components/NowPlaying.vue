<template>
  <v-container>
        <v-row>
          <v-col :cols="8">
            <v-img class="mb-6" :src="data.thumbnail"></v-img>
            <v-progress-linear
              color="red"
              rounded
              striped
              height="12"
              :value="((now - data.startTime)/(data.duration*1000))*100">
            </v-progress-linear>
            <p>
              [ {{ elapsedTime }} /
               {{ data.totalTime }} ]
            </p>
          </v-col>
          <v-col :cols="4">
            <h3>{{data.title}}</h3>
            <p>Uploaded by: {{data.uploader}}<br />
               Requested by: {{data.requester.displayName}}</p>
          </v-col>
        </v-row>
        
        
        <p style="display: inline-block"></p>
  </v-container>
</template>

<script>
import * as format from 'format-duration';
// import FastAverageColor from 'fast-average-color';
export default {
  props: ['data'],
  data: function() {
    return {
      now: Date.now(),
      elapsedTime: '0:00',
      totalTime: '0:00',
    };
  },
  mounted() {
    setInterval(() => {
      this.now = Date.now();
      if (this.data) {
        this.elapsedTime = format(this.now - this.data.startTime);
      }
    }, 250);
  },
};
</script>

<style>

</style>
